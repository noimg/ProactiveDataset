# Signal 视频标注工具

这是一个面向视频响应标注的单页网页应用。启动 Node 服务后，页面会自动扫描同级目录 `../Videos/`（包含子目录）并加载其中的所有支持格式的视频。左侧 `＋` 可以添加多个视频文件，文件夹按钮可以一次选择整个视频文件夹。

服务端按扩展名识别常见视频格式（包括 MP4、WebM、OGG、MOV、AVI、MKV、3GP、FLV、WMV、TS 等）；最终能否播放仍取决于浏览器的编解码器支持。

## 启动

需要 Node.js 18 或更高版本。在 `ProactiveWeb` 目录执行：

```bash
npm start
```

然后打开 <http://127.0.0.1:4173/>。默认扫描项目同级的 `../Videos/` 文件夹。

也可以直接运行：

```bash
node server.js
```

也可以在启动时传入视频文件夹（支持绝对路径或相对于当前命令行目录的路径）：

```bash
node server.js /path/to/videos
# 或
node server.js --videos /path/to/videos
```

## 标注流程

1. 右侧 `USERS` 区域可以新增或删除 user，并在每个 user 下填写 profile。响应编辑器中的 `Personalize` 下拉框用于指定响应归属，不再通过 users 列表选择。
2. 在中间视频下方的时间标尺上拖动可以直接定位播放时间；在任意 user 轨道的空白区域拖动可以创建一个 response 区间。
3. 点击已有区间可编辑；区间左右手柄可以拖动调整起止时间，编辑器中的删除按钮可以移除区间。新拖出的草稿区间会一直保留到保存或放弃。
4. 编辑器中的 `Start (s)` 和 `End (s)` 是可直接输入的整秒数，标注保存时以 1 秒为最小单位，响应区间最短为 1 秒。
5. `Non-personalize` 会把区间显示到所有 user；`Personalize` 需要选择一个 user，只显示在该 user 的轨道上。
6. 在右侧响应列表点击标签，可以跳转到对应的开始时间并打开编辑器。
7. 左侧点击视频后才会加载视频内容；顶部的 Save video JSON 只保存当前视频的描述、响应和 users。再次点击该视频时会自动读取对应的标注文件。

## 导出

点击右上角 `Export JSON`。Node 服务会在当前项目目录创建：

```text
../Annotations/
```

目录中每个 user 对应一个 JSON 文件，文件名使用 user 名称。每个文件包含项目时间、user 信息（含 profile）、user requirement，以及该 user 可见的响应：所有 `non-personalize` 响应和该 user 自己的 `personalize` 响应。视频文件不复制到导出目录，仍从启动时指定的视频文件夹读取。

如果页面部署在不支持 `/api/export` 的纯静态服务器上，按钮会退化为逐 user 下载 JSON 文件。

## 目录结构

从项目根目录看，文件夹和主要文件如下：

```text
.
├── ProactiveWeb/
│   ├── index.html       # 页面结构
│   ├── styles.css       # 页面样式与响应式布局
│   ├── app.js           # 播放、时间轴、user 和标注交互
│   ├── server.js        # 静态文件服务、Range 视频响应、JSON 导出接口
│   ├── package.json     # npm start 启动配置
│   └── README.md        # 使用说明
├── Videos/
│   └── Neon v1 ps1.mp4 # 默认测试视频及其他视频资源
└── Annotations/         # 点击 Export JSON 后生成的 user 标注文件
    ├── Alex.json
    └── ...
```

`ProactiveWeb/server.js` 运行在项目目录内，默认从同级 `Videos` 递归读取视频；也可以通过启动参数指定其他文件夹。服务通过 `/api/videos` 提供清单，再把导出文件写入同级 `Annotations`。浏览器选择的文件夹只在当前页面会话中使用，不会上传或复制到服务器。
