const http = require("http");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { URL } = require("url");

const ROOT = __dirname;
const DEFAULT_VIDEO_DIR = path.resolve(ROOT, "../Videos");
// Accept either `node server.js <directory>` or `node server.js --videos <directory>`.
const videoArgumentIndex = process.argv[2] === "--videos" ? 3 : 2;
const VIDEO_DIR_ARGUMENT = process.argv[videoArgumentIndex];
const VIDEO_DIR = VIDEO_DIR_ARGUMENT ? path.resolve(process.cwd(), VIDEO_DIR_ARGUMENT) : DEFAULT_VIDEO_DIR;
const ANNOTATIONS_DIR = path.resolve(ROOT, "../Annotations");
const PORT = Number(process.env.PORT) || 4173;
const MAX_BODY_SIZE = 8 * 1024 * 1024;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".ogv": "video/ogg",
  ".ogg": "video/ogg",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".3gp": "video/3gpp",
  ".3g2": "video/3gpp2",
  ".flv": "video/x-flv",
  ".wmv": "video/x-ms-wmv",
  ".ts": "video/mp2t",
  ".m2ts": "video/mp2t",
  ".mts": "video/mp2t",
  ".f4v": "video/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const VIDEO_EXTENSIONS = new Set([
  ".mp4", ".m4v", ".webm", ".ogv", ".ogg", ".mov", ".avi", ".mkv",
  ".3gp", ".3g2", ".flv", ".wmv", ".ts", ".m2ts", ".mts", ".f4v"
]);

function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body) });
  response.end(body);
}

function safeFileName(value) {
  return String(value || "user").trim().replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]+/g, "-").replace(/^-+|-+$/g, "") || "user";
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_SIZE) throw new Error("Request body is too large");
  }
  return JSON.parse(body || "{}");
}

function videoSource(relativePath) {
  return `/Videos/${relativePath.split(path.sep).map(encodeURIComponent).join("/")}`;
}

async function listVideos(directory, relativeDirectory = "") {
  let entries;
  try {
    entries = await fsp.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const videos = [];
  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      videos.push(...await listVideos(absolutePath, relativePath));
      continue;
    }
    if (!entry.isFile() || !VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    const stats = await fsp.stat(absolutePath);
    const normalizedPath = relativePath.split(path.sep).join("/");
    videos.push({
      id: `video-${Buffer.from(normalizedPath).toString("hex")}`,
      name: entry.name,
      relativePath: normalizedPath,
      src: videoSource(relativePath),
      size: stats.size,
      modifiedAt: stats.mtime.toISOString()
    });
  }
  return videos;
}

async function sendVideoList(response) {
  const videos = (await listVideos(VIDEO_DIR)).sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { sensitivity: "base" }));
  sendJson(response, 200, { directory: VIDEO_DIR, videos });
}

async function exportPerUser(payload) {
  const users = Array.isArray(payload.users) ? payload.users : [];
  const videos = Array.isArray(payload.videos) ? payload.videos : [];
  await fsp.mkdir(ANNOTATIONS_DIR, { recursive: true });
  const usedNames = new Set();
  const files = [];

  for (const user of users) {
    const base = safeFileName(user.name || user.id);
    let fileName = `${base}.json`;
    let index = 2;
    while (usedNames.has(fileName)) fileName = `${base}-${index++}.json`;
    usedNames.add(fileName);
    const userVideos = videos.map((video) => ({
      id: video.id,
      name: video.name,
      description: video.description || "",
      responses: (Array.isArray(video.responses) ? video.responses : []).filter((response) => response.mode === "non-personalize" || response.userId === user.id).map((response) => {
        const start = Math.max(0, Math.round(Number(response.start) || 0));
        const end = Math.max(start + 1, Math.round(Number(response.end) || start + 1));
        return { ...response, start, end };
      })
    }));
    const content = { project: payload.project || "Video annotation", exportedAt: payload.exportedAt || new Date().toISOString(), user: { id: user.id, name: user.name, profile: user.profile || "" }, videos: userVideos };
    await fsp.writeFile(path.join(ANNOTATIONS_DIR, fileName), `${JSON.stringify(content, null, 2)}\n`, "utf8");
    files.push(`../Annotations/${fileName}`);
  }
  return files;
}

function annotationPath(videoId) {
  const fileName = `${safeFileName(videoId)}.json`;
  return path.join(ANNOTATIONS_DIR, fileName);
}

async function readVideoAnnotation(videoId) {
  try {
    const content = await fsp.readFile(annotationPath(videoId), "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeVideoAnnotation(videoId, payload) {
  await fsp.mkdir(ANNOTATIONS_DIR, { recursive: true });
  const content = {
    id: payload.id || videoId,
    name: payload.name || "",
    description: payload.description || "",
    responses: Array.isArray(payload.responses) ? payload.responses : [],
    users: Array.isArray(payload.users) ? payload.users : [],
    savedAt: new Date().toISOString()
  };
  await fsp.writeFile(annotationPath(videoId), `${JSON.stringify(content, null, 2)}\n`, "utf8");
}

async function serveStatic(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(requestUrl.pathname);
  const isVideoRequest = pathname === "/Videos" || pathname.startsWith("/Videos/");
  const staticRoot = isVideoRequest ? VIDEO_DIR : ROOT;
  let relative = (isVideoRequest ? pathname.slice("/Videos".length) : pathname).replace(/^\/+/, "");
  if (!relative) relative = "index.html";
  let filePath = path.resolve(staticRoot, relative);
  if (filePath !== staticRoot && !filePath.startsWith(`${staticRoot}${path.sep}`)) {
    response.writeHead(403); response.end("Forbidden"); return;
  }
  try {
    let stats = await fsp.stat(filePath);
    if (stats.isDirectory()) { filePath = path.join(filePath, "index.html"); stats = await fsp.stat(filePath); }
    const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    const rangeHeader = request.headers.range;
    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
      if (match) {
        const start = match[1] ? Number(match[1]) : Math.max(0, stats.size - Number(match[2] || 0));
        const end = match[2] ? Number(match[2]) : stats.size - 1;
        if (start <= end && start < stats.size) {
          const boundedEnd = Math.min(end, stats.size - 1);
          const length = boundedEnd - start + 1;
          response.writeHead(206, { "Content-Type": contentType, "Content-Length": length, "Content-Range": `bytes ${start}-${boundedEnd}/${stats.size}`, "Accept-Ranges": "bytes" });
          if (request.method === "HEAD") response.end();
          else fs.createReadStream(filePath, { start, end: boundedEnd }).pipe(response);
          return;
        }
      }
      response.writeHead(416, { "Content-Range": `bytes */${stats.size}` });
      response.end();
      return;
    }
    response.writeHead(200, { "Content-Type": contentType, "Content-Length": stats.size, "Accept-Ranges": "bytes" });
    if (request.method === "HEAD") response.end();
    else fs.createReadStream(filePath).pipe(response);
  } catch (error) {
    if (error.code === "ENOENT") { response.writeHead(404); response.end("Not found"); }
    else { response.writeHead(500); response.end("Server error"); }
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    if (request.method === "GET" && requestUrl.pathname === "/api/videos") {
      await sendVideoList(response);
      return;
    }
    const annotationMatch = /^\/api\/annotations\/([^/]+)$/.exec(requestUrl.pathname);
    if (annotationMatch && request.method === "GET") {
      const videoId = decodeURIComponent(annotationMatch[1]);
      const annotation = await readVideoAnnotation(videoId);
      if (!annotation) { response.writeHead(404); response.end("Not found"); return; }
      sendJson(response, 200, annotation);
      return;
    }
    if (annotationMatch && request.method === "POST") {
      const videoId = decodeURIComponent(annotationMatch[1]);
      await writeVideoAnnotation(videoId, await readJson(request));
      sendJson(response, 200, { ok: true });
      return;
    }
    if (request.method === "GET" || request.method === "HEAD") {
      await serveStatic(request, response);
      return;
    }
    response.writeHead(405, { Allow: "GET, HEAD, POST" });
    response.end("Method not allowed");
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Invalid request" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Signal video annotation running at http://127.0.0.1:${PORT}`);
});
