const state = {
  users: [
    {
      id: "user-james",
      name: "James",
      profile: "Likes frequent reminders and proactive nudges. Responds well to strong, direct, urgent language. Wants clear instructions, repeated prompts, and explicit calls to action to stay on track.",
      color: "#e46f57"
    },
    {
      id: "user-mary",
      name: "Mary",
      profile: "Dislikes frequent reminders and interruptions. Prefers minimal, gentle, respectful prompts. Responds better to calm, supportive language and soft suggestions, with control over when to engage.",
      color: "#2d8c8c"
    }
  ],
  selectedUserId: "user-james",
  videos: [],
  currentVideoId: null,
  selectedResponseId: null,
  editor: null,
  draft: null,
  scrubTime: null,
  isDirty: false,
  videoListVisibleCount: 10,
  videoLoadToken: 0,
};

const VIDEO_PAGE_SIZE = 10;
const $ = (selector) => document.querySelector(selector);
const videoEl = $("#videoPlayer");
const userTimelinesEl = $("#userTimelines");
const editorEl = $("#responseEditor");

function currentVideo() {
  return state.videos.find((video) => video.id === state.currentVideoId);
}

function formatTime(seconds, includeTenths = false) {
  const value = Math.max(0, Number(seconds) || 0);
  const mins = Math.floor(value / 60);
  const secs = Math.floor(value % 60);
  const base = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return includeTenths ? `${base}.${Math.floor((value % 1) * 10)}` : base;
}

function setDirty(dirty = true) {
  state.isDirty = dirty;
  $("#saveState").textContent = dirty ? "Unsaved changes" : "All changes saved";
  $(".save-dot").style.background = dirty ? "#d39c3d" : "#5aa681";
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2400);
}

function getDuration() {
  return currentVideo()?.duration || videoEl.duration || 1;
}

function wholeSecondRange(start, end, duration = getDuration()) {
  const maxSecond = Math.max(1, Math.floor(Number(duration) || 1));
  const rawStart = Math.max(0, Math.round(Number(start) || 0));
  const rawEnd = Math.max(rawStart + 1, Math.round(Number(end) || rawStart + 1));
  const normalizedStart = Math.min(maxSecond - 1, rawStart);
  return { start: normalizedStart, end: Math.min(maxSecond, Math.max(normalizedStart + 1, rawEnd)) };
}

function createVideoListItem(video) {
  const button = document.createElement("button");
  button.className = `video-item${video.id === state.currentVideoId ? " active" : ""}`;
  button.title = video.name;
  button.innerHTML = `<span class="video-thumb"><span class="thumb-placeholder" aria-hidden="true">▸</span><span class="thumb-play">▶</span></span><span class="video-copy"><span class="video-title">${escapeHtml(video.name)}</span><span class="video-subtitle">${video.responses.length} response${video.responses.length === 1 ? "" : "s"}</span></span>`;
  button.addEventListener("click", () => selectVideo(video.id));
  return button;
}

function renderVideoList() {
  const list = $("#videoList");
  list.innerHTML = "";
  if (!state.videos.length) {
    const empty = document.createElement("p");
    empty.className = "video-list-empty";
    empty.textContent = "No videos loaded";
    list.appendChild(empty);
  }
  state.videos.slice(0, state.videoListVisibleCount).forEach((video) => list.appendChild(createVideoListItem(video)));
  if (state.videos.length > state.videoListVisibleCount) {
    const remaining = state.videos.length - state.videoListVisibleCount;
    const moreButton = document.createElement("button");
    moreButton.className = "video-list-more";
    moreButton.type = "button";
    moreButton.textContent = `Load ${Math.min(VIDEO_PAGE_SIZE, remaining)} more`;
    moreButton.addEventListener("click", revealMoreVideos);
    list.appendChild(moreButton);
  }
  $("#videoCount").textContent = state.videos.length;
}

function revealMoreVideos() {
  if (state.videoListVisibleCount >= state.videos.length) return;
  const list = $("#videoList");
  const previousCount = state.videoListVisibleCount;
  state.videoListVisibleCount = Math.min(state.videos.length, previousCount + VIDEO_PAGE_SIZE);
  const moreButton = list.querySelector(".video-list-more");
  state.videos.slice(previousCount, state.videoListVisibleCount).forEach((video) => {
    list.insertBefore(createVideoListItem(video), moreButton || null);
  });
  if (moreButton) {
    const remaining = state.videos.length - state.videoListVisibleCount;
    if (remaining > 0) moreButton.textContent = `Load ${Math.min(VIDEO_PAGE_SIZE, remaining)} more`;
    else moreButton.remove();
  }
}

function handleVideoListScroll(event) {
  const list = event.currentTarget;
  if (list.scrollTop + list.clientHeight >= list.scrollHeight - 28) revealMoreVideos();
}

function renderUserList() {
  const list = $("#userList");
  list.innerHTML = "";
  state.users.forEach((user) => {
    const row = document.createElement("div");
    row.className = "user-card";
    row.innerHTML = `<div class="user-card-head"><span class="user-color" style="background:${user.color}"></span><span class="user-choice-name">${escapeHtml(user.name)}</span><button class="user-delete" type="button" title="删除 ${escapeHtml(user.name)}" aria-label="删除 ${escapeHtml(user.name)}">×</button></div><textarea class="user-profile-input" maxlength="240" rows="2" placeholder="User profile"></textarea>`;
    const profileInput = row.querySelector(".user-profile-input");
    profileInput.value = user.profile || "";
    profileInput.addEventListener("input", (event) => { user.profile = event.target.value; setDirty(); });
    row.querySelector(".user-delete").addEventListener("click", () => deleteUser(user.id));
    list.appendChild(row);
  });
}

function renderResponseList() {
  const list = $("#responseList");
  const responses = [...(currentVideo()?.responses || [])].sort((a, b) => a.start - b.start || a.end - b.end);
  list.innerHTML = "";
  $("#responseCount").textContent = responses.length;
  if (!responses.length) {
    const empty = document.createElement("p");
    empty.className = "response-list-empty";
    empty.textContent = "No responses yet";
    list.appendChild(empty);
    return;
  }
  responses.forEach((response) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `response-list-item${response.id === state.selectedResponseId ? " active" : ""}`;
    const user = response.mode === "personalize" ? state.users.find((candidate) => candidate.id === response.userId) : null;
    const color = user?.color || (response.mode === "personalize" ? "#2d8c8c" : "#e46f57");
    const scope = response.mode === "personalize" ? (user?.name || "Personal") : "All users";
    item.title = `${formatTime(response.start)} – ${formatTime(response.end)} · ${response.text || scope}`;
    item.innerHTML = `<span class="response-list-dot" style="background:${color}"></span><span class="response-list-copy"><span class="response-list-title">${escapeHtml(response.text || (response.mode === "personalize" ? "Personal response" : "Shared response"))}</span><span class="response-list-meta">${escapeHtml(scope)}</span></span><span class="response-list-time">${formatTime(response.start)}</span>`;
    item.addEventListener("click", () => {
      videoEl.currentTime = response.start;
      state.selectedResponseId = response.id;
      openEditor(response);
      renderResponseList();
      renderUserTimelines();
    });
    list.appendChild(item);
  });
}

function deleteUser(userId) {
  const user = state.users.find((item) => item.id === userId);
  if (!user) return;
  const personalCount = state.videos.reduce((total, video) => total + video.responses.filter((response) => response.mode === "personalize" && response.userId === userId).length, 0);
  const suffix = personalCount ? ` This removes ${personalCount} personal response${personalCount === 1 ? "" : "s"}.` : "";
  if (!window.confirm(`Delete ${user.name}?${suffix}`)) return;
  state.users = state.users.filter((item) => item.id !== userId);
  state.videos.forEach((video) => { video.responses = video.responses.filter((response) => response.mode !== "personalize" || response.userId !== userId); });
  if (state.selectedUserId === userId) state.selectedUserId = state.users[0]?.id || null;
  if (state.editor?.userId === userId) { state.editor = null; editorEl.hidden = true; }
  state.selectedResponseId = null;
  setDirty();
  renderAll();
  showToast(`${user.name} deleted`);
}

async function selectVideo(videoId) {
  const video = state.videos.find((item) => item.id === videoId);
  if (!video) return;
  if (state.currentVideoId === videoId && videoEl.src) return;
  if (state.isDirty) await saveVideoAnnotation({ silent: true });
  state.currentVideoId = videoId;
  state.selectedResponseId = null;
  state.editor = null;
  editorEl.hidden = true;
  setVideoSource(null);
  renderAll();
  loadVideoAnnotation(video).then(() => {
    if (state.currentVideoId === video.id) setVideoSource(video);
  });
}

function setVideoSource(video) {
  if (video) {
    videoEl.src = video.src;
    videoEl.load();
    $("#descriptionInput").value = video.description || "";
  } else {
    videoEl.removeAttribute("src");
    videoEl.load();
    $("#descriptionInput").value = "";
  }
  updateDescriptionCount();
}

async function loadVideoAnnotation(video) {
  const token = ++state.videoLoadToken;
  try {
    const response = await fetch(`/api/annotations/${encodeURIComponent(video.id)}`, { headers: { Accept: "application/json" } });
    if (response.status === 404) return;
    if (!response.ok) throw new Error(`Annotation load failed (${response.status})`);
    const payload = await response.json();
    if (token !== state.videoLoadToken || state.currentVideoId !== video.id) return;
    video.description = payload.description || "";
    video.responses = Array.isArray(payload.responses) ? payload.responses : [];
    if (Array.isArray(payload.users) && payload.users.length) {
      state.users = payload.users;
      if (!state.users.some((user) => user.id === state.selectedUserId)) state.selectedUserId = state.users[0].id;
    }
    renderAll();
    setDirty(false);
  } catch (error) {
    if (token === state.videoLoadToken) showToast("该视频标注 JSON 加载失败");
  }
}

async function saveVideoAnnotation(options = {}) {
  const video = currentVideo();
  if (!video) return;
  const payload = { id: video.id, name: video.name, description: video.description || "", responses: video.responses || [], users: state.users.map(({ id, name, profile, color }) => ({ id, name, profile: profile || "", color })) };
  try {
    const response = await fetch(`/api/annotations/${encodeURIComponent(video.id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error("save failed");
    setDirty(false);
    if (!options.silent) showToast("当前视频标注已保存");
  } catch (error) {
    showToast("服务器不可用，标注未保存");
  }
}

function renderRuler() {
  const ruler = $("#timeRuler");
  ruler.innerHTML = "";
  const duration = getDuration();
  const count = duration > 90 ? 6 : duration > 30 ? 5 : 4;
  for (let i = 0; i <= count; i += 1) {
    const percentage = (i / count) * 100;
    const mark = document.createElement("span");
    mark.className = "ruler-mark";
    mark.style.left = `${percentage}%`;
    mark.innerHTML = `<span class="ruler-label">${formatTime(duration * i / count)}</span>`;
    ruler.appendChild(mark);
  }
}

function visibleResponsesForUser(userId) {
  return (currentVideo()?.responses || []).filter((response) => response.mode === "non-personalize" || response.userId === userId);
}

function renderUserTimelines() {
  userTimelinesEl.innerHTML = "";
  const duration = getDuration();
  $("#emptyTimeline").hidden = state.users.length > 0;
  state.users.forEach((user) => {
    const row = document.createElement("div");
    row.className = "user-row";
    const responses = visibleResponsesForUser(user.id);
    row.innerHTML = `<div class="user-label"><span class="user-color" style="background:${user.color}"></span><span class="user-name">${escapeHtml(user.name)}</span><span class="user-response-count">${responses.length}</span></div><div class="timeline-track${responses.length ? "" : " is-empty"}" data-user-id="${user.id}"></div>`;
    const track = row.querySelector(".timeline-track");
    track.style.setProperty("--playhead", `${(videoEl.currentTime / duration) * 100}%`);
    responses.sort((a, b) => a.start - b.start).forEach((response) => {
      const segment = document.createElement("div");
      const left = Math.max(0, (response.start / duration) * 100);
      const width = Math.max(.5, ((response.end - response.start) / duration) * 100);
      segment.className = `segment ${response.mode}${response.id === state.selectedResponseId ? " selected" : ""}`;
      segment.dataset.responseId = response.id;
      segment.style.left = `${left}%`;
      segment.style.width = `${width}%`;
      segment.title = `${formatTime(response.start)} – ${formatTime(response.end)}`;
      segment.innerHTML = `<span class="segment-label">${escapeHtml(response.text || (response.mode === "personalize" ? "Personal response" : "Shared response"))}</span><span class="segment-handle start" data-edge="start"></span><span class="segment-handle end" data-edge="end"></span>`;
      segment.addEventListener("pointerdown", (event) => beginSegmentInteraction(event, response, user.id));
      segment.addEventListener("click", (event) => { if (!state.segmentDidDrag) openEditor(response); event.stopPropagation(); });
      track.appendChild(segment);
    });
    if (state.draft && !state.editor?.responseId && state.draft.userId === user.id) {
      const draftSegment = document.createElement("div");
      draftSegment.className = "segment non-personalize draft-segment";
      draftSegment.style.left = `${Math.max(0, state.draft.start) / duration * 100}%`;
      draftSegment.style.width = `${Math.max(.5, (state.draft.end - state.draft.start) / duration * 100)}%`;
      draftSegment.innerHTML = '<span class="segment-label">Draft range</span>';
      track.appendChild(draftSegment);
    }
    track.addEventListener("pointerdown", (event) => beginTrackInteraction(event, user.id));
    userTimelinesEl.appendChild(row);
  });
}

function renderAll() {
  renderVideoList();
  renderUserList();
  renderResponseList();
  renderRuler();
  renderUserTimelines();
  updatePlayhead();
  updateDescriptionCount();
}

function updatePlayhead() {
  const duration = getDuration();
  const time = state.scrubTime ?? videoEl.currentTime;
  document.querySelectorAll(".timeline-track").forEach((track) => track.style.setProperty("--playhead", `${Math.min(100, Math.max(0, (time / duration) * 100))}%`));
  $("#overlayTime").textContent = formatTime(time);
}

function updateDescriptionCount() {
  const value = $("#descriptionInput").value || "";
  $("#descriptionCount").textContent = `${value.length} / 240`;
}

function timeFromEvent(event, track) {
  const rect = track.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  return ratio * getDuration();
}

function beginTrackInteraction(event, userId) {
  if (!currentVideo()) return;
  if (event.target.closest(".segment")) return;
  const track = event.currentTarget;
  const start = timeFromEvent(event, track);
  state.trackInteraction = { track, userId, start, last: start, moved: false };
  track.setPointerCapture?.(event.pointerId);
  const move = (moveEvent) => {
    if (!state.trackInteraction) return;
    const current = timeFromEvent(moveEvent, track);
    state.trackInteraction.last = current;
    if (Math.abs(current - start) > .12) state.trackInteraction.moved = true;
    renderDraftOnTrack(track, start, current);
  };
  const end = (endEvent) => {
    track.releasePointerCapture?.(endEvent.pointerId);
    track.removeEventListener("pointermove", move);
    track.removeEventListener("pointerup", end);
    const interaction = state.trackInteraction;
    state.trackInteraction = null;
    const finish = timeFromEvent(endEvent, track);
    if (!interaction.moved || Math.abs(finish - start) < .12) {
      videoEl.currentTime = finish;
      return;
    }
    const range = wholeSecondRange(Math.min(start, finish), Math.max(start, finish));
    state.draft = { ...range, userId };
    openEditor();
    renderUserTimelines();
  };
  track.addEventListener("pointermove", move);
  track.addEventListener("pointerup", end);
}

function beginRulerSeek(event) {
  if (!currentVideo()) return;
  if (event.button !== 0) return;
  event.preventDefault();
  const ruler = event.currentTarget;
  let pendingTime = timeFromEvent(event, ruler);
  let framePending = false;
  state.scrubTime = pendingTime;
  updatePlayhead();
  ruler.setPointerCapture?.(event.pointerId);
  const preview = (moveEvent) => {
    pendingTime = timeFromEvent(moveEvent, ruler);
    state.scrubTime = pendingTime;
    if (framePending) return;
    framePending = true;
    requestAnimationFrame(() => {
      framePending = false;
      if (state.scrubTime !== null) updatePlayhead();
    });
  };
  const end = (upEvent, commit = true) => {
    ruler.releasePointerCapture?.(upEvent.pointerId);
    ruler.removeEventListener("pointermove", move);
    ruler.removeEventListener("pointerup", end);
    ruler.removeEventListener("pointercancel", cancel);
    state.scrubTime = null;
    state.isScrubbing = false;
    if (commit) videoEl.currentTime = pendingTime;
    updatePlayhead();
  };
  const move = preview;
  const cancel = (cancelEvent) => end(cancelEvent, false);
  state.isScrubbing = true;
  ruler.addEventListener("pointermove", move);
  ruler.addEventListener("pointerup", end);
  ruler.addEventListener("pointercancel", cancel);
}

function renderDraftOnTrack(track, start, end) {
  const existing = track.querySelector(".draft-segment");
  if (existing) existing.remove();
  const duration = getDuration();
  const draft = document.createElement("div");
  draft.className = "segment non-personalize draft-segment";
  draft.style.left = `${Math.min(start, end) / duration * 100}%`;
  draft.style.width = `${Math.max(.5, Math.abs(end - start) / duration * 100)}%`;
  track.appendChild(draft);
}

function beginSegmentInteraction(event, response, userId) {
  event.stopPropagation();
  event.preventDefault();
  const segment = event.currentTarget;
  const track = segment.parentElement;
  let edge = event.target.closest?.(".segment-handle")?.dataset.edge;
  if (!edge) {
    const bounds = segment.getBoundingClientRect();
    const leftDistance = Math.abs(event.clientX - bounds.left);
    const rightDistance = Math.abs(bounds.right - event.clientX);
    const edgeThreshold = Math.min(18, Math.max(8, bounds.width / 2));
    if (leftDistance <= edgeThreshold || rightDistance <= edgeThreshold) edge = leftDistance <= rightDistance ? "start" : "end";
  }
  state.segmentDidDrag = false;
  state.selectedResponseId = response.id;
  if (!edge) {
    videoEl.currentTime = response.start;
    state.selectedResponseId = response.id;
    openEditor(response);
    renderAll();
    return;
  }
  const original = { start: response.start, end: response.end };
  track.setPointerCapture?.(event.pointerId);
  const move = (moveEvent) => {
      const value = Math.min(Math.max(1, Math.floor(getDuration())), Math.max(0, Math.round(timeFromEvent(moveEvent, track))));
      const next = edge === "start" ? { start: Math.min(value, response.end - 1), end: response.end } : { start: response.start, end: Math.max(value, response.start + 1) };
    if (Math.abs(next[edge] - original[edge]) > .04) state.segmentDidDrag = true;
    const normalized = wholeSecondRange(next.start, next.end);
    response.start = normalized.start;
    response.end = normalized.end;
    if (state.editor?.responseId === response.id) {
      state.editor.start = response.start;
      state.editor.end = response.end;
    }
    const duration = getDuration();
    document.querySelectorAll(`.segment[data-response-id="${response.id}"]`).forEach((item) => {
      item.style.left = `${response.start / duration * 100}%`;
      item.style.width = `${Math.max(.5, (response.end - response.start) / duration * 100)}%`;
    });
    updateEditorRange(response);
  };
  const end = (upEvent) => {
    track.releasePointerCapture?.(upEvent.pointerId);
    track.removeEventListener("pointermove", move);
    track.removeEventListener("pointerup", end);
    track.removeEventListener("pointercancel", end);
    if (state.segmentDidDrag) { setDirty(); showToast("Range updated"); renderUserTimelines(); }
  };
  track.addEventListener("pointermove", move);
  track.addEventListener("pointerup", end);
  track.addEventListener("pointercancel", end);
}

function openEditor(response = null) {
  if (!currentVideo()) return;
  state.editor = response ? { responseId: response.id, mode: response.mode, userId: response.userId || state.selectedUserId, start: response.start, end: response.end, originalStart: response.start, originalEnd: response.end } : { responseId: null, mode: "non-personalize", userId: state.draft?.userId || state.selectedUserId, start: state.draft?.start ?? videoEl.currentTime, end: state.draft?.end ?? Math.min(getDuration(), videoEl.currentTime + 2) };
  editorEl.hidden = false;
  $("#editorTitle").textContent = "Response Range";
  $("#deleteResponseButton").textContent = response ? "Delete response" : "Discard range";
  $("#responseTextInput").value = response?.text || "";
  $("#editorValidation").textContent = "";
  setEditorMode(state.editor.mode);
  updateEditorRange(state.editor);
  populateUserSelect();
  editorEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function updateEditorRange(range) {
  $("#editorStartInput").value = Math.round(Number(range.start) || 0);
  $("#editorEndInput").value = Math.round(Number(range.end) || 0);
  $("#editorDuration").textContent = `${Math.max(0, Math.round(range.end - range.start))}s`;
}

function updateEditorTime(edge, rawValue) {
  if (!state.editor) return;
  const value = Math.round(Number(rawValue));
  if (!Number.isFinite(value)) return;
  const duration = Math.max(1, Math.floor(getDuration()));
  if (edge === "start") state.editor.start = Math.max(0, Math.min(value, state.editor.end - 1));
  else state.editor.end = Math.min(duration, Math.max(value, state.editor.start + 1));
  if (state.editor.responseId) {
    const response = currentVideo()?.responses.find((item) => item.id === state.editor.responseId);
    if (response) { response.start = state.editor.start; response.end = state.editor.end; }
  } else if (state.draft) {
    state.draft.start = state.editor.start;
    state.draft.end = state.editor.end;
  }
  updateEditorRange(state.editor);
  renderUserTimelines();
  setDirty();
}

function setEditorMode(mode) {
  if (!state.editor) return;
  state.editor.mode = mode;
  document.querySelectorAll(".mode-option").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  $("#personalizedUserField").hidden = mode !== "personalize";
  populateUserSelect();
}

function populateUserSelect() {
  const select = $("#responseUserSelect");
  select.innerHTML = state.users.map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join("");
  if (state.editor) select.value = state.editor.userId || state.selectedUserId;
}

function saveResponse() {
  if (!state.editor) return;
  const video = currentVideo();
  if (!video) return;
  const scrollY = window.scrollY;
  const text = $("#responseTextInput").value.trim();
  if (!text) { $("#editorValidation").textContent = "Please add response content."; $("#responseTextInput").focus(); return; }
  if (state.editor.mode === "personalize" && !state.users.length) { $("#editorValidation").textContent = "Add a user before saving a personal response."; return; }
  const range = wholeSecondRange(state.editor.start, state.editor.end);
  const start = range.start;
  const end = range.end;
  const userId = state.editor.mode === "personalize" ? $("#responseUserSelect").value : null;
  if (state.editor.responseId) {
    const response = video.responses.find((item) => item.id === state.editor.responseId);
    if (response) Object.assign(response, { start, end, mode: state.editor.mode, userId, text });
  } else {
    video.responses.push({ id: `response-${Date.now()}`, start, end, mode: state.editor.mode, userId, text });
  }
  state.selectedResponseId = state.editor.responseId || video.responses[video.responses.length - 1].id;
  state.draft = null;
  state.editor = null;
  editorEl.hidden = true;
  setDirty();
  renderAll();
  requestAnimationFrame(() => window.scrollTo(0, scrollY));
  showToast("Response saved");
}

function deleteResponse() {
  if (!state.editor) return;
  if (!state.editor.responseId) { cancelEditor(); return; }
  const video = currentVideo();
  if (!video) return;
  const response = video.responses.find((item) => item.id === state.editor.responseId);
  if (!response || !window.confirm("Delete this response range?")) return;
  video.responses = video.responses.filter((item) => item.id !== response.id);
  state.selectedResponseId = null;
  state.editor = null;
  state.draft = null;
  editorEl.hidden = true;
  setDirty();
  renderAll();
  showToast("Response deleted");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}


function safeFileName(value) {
  return String(value).trim().replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]+/g, "-").replace(/^-+|-+$/g, "") || "user";
}

const VIDEO_FILE_EXTENSIONS = new Set([
  "mp4", "m4v", "webm", "ogv", "ogg", "mov", "avi", "mkv",
  "3gp", "3g2", "flv", "wmv", "ts", "m2ts", "mts", "f4v"
]);

function isVideoFile(file) {
  const extension = String(file.name || "").split(".").pop().toLowerCase();
  return String(file.type || "").startsWith("video/") || VIDEO_FILE_EXTENSIONS.has(extension);
}

function videoIdentity(video) {
  return video.relativePath || video.src;
}

function addVideos(fileList) {
  const files = Array.from(fileList || []).filter(isVideoFile);
  if (!files.length) {
    showToast("No supported video files selected");
    return;
  }

  const existing = new Set(state.videos.map(videoIdentity));
  const added = [];
  files.forEach((file, index) => {
    const relativePath = file.webkitRelativePath || file.name;
    if (existing.has(relativePath)) return;
    const video = {
      id: `video-local-${Date.now()}-${index}`,
      name: file.name,
      relativePath,
      src: URL.createObjectURL(file),
      size: file.size,
      duration: 0,
      description: "",
      responses: [],
      isDefault: false
    };
    existing.add(videoIdentity(video));
    added.push(video);
  });

  if (!added.length) {
    showToast("Selected videos are already in the library");
    return;
  }
  state.videos.push(...added);
  state.currentVideoId = added[0].id;
  state.selectedResponseId = null;
  state.editor = null;
  state.draft = null;
  editorEl.hidden = true;
  setVideoSource(null);
  renderAll();
  showToast(`${added.length} video${added.length === 1 ? "" : "s"} added`);
}

async function loadDefaultVideos() {
  try {
    const response = await fetch("/api/videos", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Video list unavailable (${response.status})`);
    const result = await response.json();
    const previousDefaults = state.videos.filter((video) => video.isDefault);
    const discovered = (Array.isArray(result.videos) ? result.videos : []).map((video) => {
      const previous = previousDefaults.find((item) => item.relativePath === video.relativePath || item.name === video.name);
      return {
        ...video,
        duration: previous?.duration || 0,
        description: previous?.description || "",
        responses: previous?.responses || [],
        isDefault: false
      };
    });
    const localVideos = state.videos.filter((video) => !video.isDefault);
   state.videos = [...discovered, ...localVideos];
    await Promise.all(state.videos.map(async (video) => {
      try {
        const response = await fetch(`/api/annotations/${encodeURIComponent(video.id)}`, { headers: { Accept: "application/json" } });
        if (!response.ok) return;
        const payload = await response.json();
        video.description = payload.description || "";
        video.responses = Array.isArray(payload.responses) ? payload.responses : [];
        if (Array.isArray(payload.users) && payload.users.length) state.users = payload.users;
      } catch (error) { /* Individual annotation files are optional. */ }
    }));
   const selected = state.videos.find((video) => video.id === state.currentVideoId) || state.videos[0] || null;
    state.currentVideoId = selected?.id || null;
    setVideoSource(null);
    renderAll();
    if (!selected) showToast("No videos found in ../Videos");
  } catch (error) {
    showToast("Default video list unavailable; use the folder button");
  }
}

$("#descriptionInput").addEventListener("input", () => {
  const video = currentVideo();
  if (!video) return;
  video.description = $("#descriptionInput").value;
  updateDescriptionCount();
  setDirty();
});
$("#videoInput").addEventListener("change", (event) => {
  addVideos(event.target.files);
  event.target.value = "";
});
$("#videoFolderInput").addEventListener("change", (event) => {
  addVideos(event.target.files);
  event.target.value = "";
});
$("#videoList").addEventListener("scroll", handleVideoListScroll);
$("#toggleUsersButton").addEventListener("click", (event) => {
  const button = event.currentTarget;
  const content = $("#usersContent");
  const expanded = button.getAttribute("aria-expanded") === "true";
  button.setAttribute("aria-expanded", String(!expanded));
  content.hidden = expanded;
});
$("#addUserButton").addEventListener("click", () => {
  const content = $("#usersContent");
  if (content.hidden) {
    content.hidden = false;
    $("#toggleUsersButton").setAttribute("aria-expanded", "true");
  }
  const form = $("#addUserForm");
  form.hidden = !form.hidden;
  if (!form.hidden) $("#newUserInput").focus();
});
$("#confirmAddUser").addEventListener("click", addUser);
$("#newUserInput").addEventListener("keydown", (event) => { if (event.key === "Enter") addUser(); });
$("#saveVideoButton").addEventListener("click", saveVideoAnnotation);
$("#timeRuler").addEventListener("pointerdown", beginRulerSeek);
$("#timeRuler").addEventListener("selectstart", (event) => event.preventDefault());
$("#editorStartInput").addEventListener("change", (event) => updateEditorTime("start", event.target.value));
$("#editorEndInput").addEventListener("change", (event) => updateEditorTime("end", event.target.value));
$("#cancelEditorButton").addEventListener("click", cancelEditor);
$("#deleteResponseButton").addEventListener("click", deleteResponse);
$("#saveResponseButton").addEventListener("click", saveResponse);
$("#responseUserSelect").addEventListener("change", (event) => { if (state.editor) state.editor.userId = event.target.value; });
document.querySelectorAll(".mode-option").forEach((button) => button.addEventListener("click", () => setEditorMode(button.dataset.mode)));
videoEl.addEventListener("loadedmetadata", () => {
  const video = currentVideo();
  if (!video) return;
  video.duration = videoEl.duration || 1;
  renderAll();
});
videoEl.addEventListener("timeupdate", updatePlayhead);
videoEl.addEventListener("play", () => $("#videoOverlay").classList.add("playing"));
videoEl.addEventListener("pause", () => $("#videoOverlay").classList.remove("playing"));
document.addEventListener("keydown", (event) => {
  if (event.target.matches("input, textarea, select")) return;
  if (event.code === "Space") { event.preventDefault(); videoEl.paused ? videoEl.play() : videoEl.pause(); }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); saveVideoAnnotation(); }
});

renderAll();
setVideoSource(null);
loadDefaultVideos();

function cancelEditor() {
  if (state.editor?.responseId) {
    const response = currentVideo()?.responses.find((item) => item.id === state.editor.responseId);
    if (response) { response.start = state.editor.originalStart; response.end = state.editor.originalEnd; }
  }
  state.editor = null;
  state.draft = null;
  editorEl.hidden = true;
  renderAll();
}

function addUser() {
  const input = $("#newUserInput");
  const name = input.value.trim();
  if (!name) return;
  const colors = ["#e46f57", "#2d8c8c", "#d39c3d", "#8564a7", "#5a82a6"];
  const user = { id: `user-${Date.now()}`, name, profile: "", color: colors[state.users.length % colors.length] };
  state.users.push(user);
  state.selectedUserId = user.id;
  input.value = "";
  $("#addUserForm").hidden = true;
  setDirty();
  renderAll();
  showToast(`${name} added`);
}
