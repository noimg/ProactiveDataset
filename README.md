# ProactiveDataset

本项目用于管理视频数据、视频片段及其标注结果，并提供一个基于 Node.js 的网页标注工具。

## 文件结构

```text
ProactiveDataset/
├── README.md                    # 项目结构说明
├── split_videos.sh              # 使用 FFmpeg 将原始视频切分为 5 分钟片段
├── Videos-origin/               # 未切分的原始视频
│   ├── 20260919-Eric-1.mp4
│   └── 20260919-Eric-2.mp4
├── Videos/                      # 切分后供标注使用的视频片段
│   ├── 20260919-Eric-1-part000.mp4
│   └── 20260919-Eric-2-part001.mp4
├── Annotations/                 # 以视频为单位保存的 JSON 标注文件
│   ├── video-<十六进制编码后的视频文件名>.json
│   └── ...
└── ProactiveWeb/                # 视频标注网页应用
    ├── README.md                # 标注工具的使用说明
    ├── index.html               # 页面结构
    ├── styles.css               # 页面样式与响应式布局
    ├── app.js                   # 视频播放、时间轴及标注交互逻辑
    ├── server.js                # 静态服务、视频接口和标注保存接口
    └── package.json             # Node.js 项目配置及启动命令
```

## 目录说明

- `Videos-origin/`：保存完整的源视频。
- `Videos/`：保存由 `split_videos.sh` 生成的视频片段，是网页工具默认读取的视频目录。
- `Annotations/`：保存各视频的描述、响应区间、响应内容和用户信息等标注数据。
- `ProactiveWeb/`：提供视频浏览、时间轴操作、用户管理和 JSON 标注导出功能。

## 视频切分

脚本依赖 `FFmpeg`。在项目根目录运行：

```bash
./split_videos.sh
```

默认读取 `Videos-origin/`，并将每段约 5 分钟的视频写入 `Videos/`。也可以指定输入和输出目录：

```bash
./split_videos.sh /path/to/input /path/to/output
```

## 启动标注工具

需要 Node.js 18 或更高版本：

```bash
cd ProactiveWeb
npm start
```

随后访问 <http://127.0.0.1:4173/>。更详细的操作说明参见 [`ProactiveWeb/README.md`](ProactiveWeb/README.md)。
