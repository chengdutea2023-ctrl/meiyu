# AI 四格故事工坊

这是接入“智美教育新生态业务底座”的网页 + 服务课件。学生录制一段故事灵感语音，课件将它整理成起承转合四格漫画脚本，生成 4 套不同风格的整页四格漫画候选，并把学生原声、字幕、背景音乐和选中的漫画合成短视频。

4 套候选默认对应 4 种美术方向：水墨写意新中式漫画、欧式故事书卡通漫画、高饱和冒险卡通漫画、美式报刊卡通漫画；学生端统一显示为“故事1”到“故事4”。

## 本地预览

```bash
cd coursewares/four-panel-story-studio
COURSEWARE_PUBLIC_BASE_URL=http://localhost:4184 \
  node server/server.js
```

访问：

```text
http://localhost:4184/?demo=1
```

`demo=1` 用于本地预览，只表示不会提交成绩或作品到底座。学生真实录音仍会走真实 ASR；只有点击“使用示例故事”时才会使用内置示例文本和示例漫画。

## 本地完整测试 ASR

1. 复制环境变量模板：

```bash
cp .env.local.example .env.local
```

2. 在 `.env.local` 中填写火山方舟和豆包语音识别配置。`COURSEWARE_PUBLIC_BASE_URL` 必须是火山云端可访问的公网 HTTPS 地址，不能是 `localhost`。

3. 启动服务：

```bash
node server/server.js
```

4. 访问 `.env.local` 中配置的公网地址或本机地址：

```text
http://localhost:4184/?demo=1
```

## 服务端环境变量

```text
ARK_API_KEY
ARK_TEXT_MODEL=doubao-seed-2-1-turbo-260628
ARK_IMAGE_MODEL=doubao-seedream-5-0-260128
ARK_IMAGE_SIZE=2K
VOLC_ASR_API_KEY
VOLC_ASR_RESOURCE_ID
COURSEWARE_PUBLIC_BASE_URL
COURSEWARE_DATA_DIR
PORT
```

`ARK_API_KEY` 是火山方舟的 API Key，用来调用豆包语言模型和 Seedream 图片模型。

`VOLC_ASR_API_KEY` 是豆包语音新版控制台的 API Key，用来调用录音文件识别标准版 HTTP。新版接口使用请求头 `X-Api-Key`，不需要填写旧版 `APP ID` / `Access Token`。

`VOLC_ASR_RESOURCE_ID` 一般可以留空。留空时服务端会自动先试录音文件识别 2.0 的 `volc.seedasr.auc`，如果返回 `requested resource not granted`，再试录音文件识别 1.0 的 `volc.bigasr.auc`。如果你确定账号只开通了其中一个，可以手动指定。

`COURSEWARE_PUBLIC_BASE_URL` 必须是火山 ASR 可以访问到的地址，服务端会把录音转成 mp3 后通过 `/media/...` 暴露给 ASR。没有配置时，ASR 接口会返回明确错误。

如需兼容旧版语音控制台，可以填写 `VOLC_ASR_APP_ID` 和 `VOLC_ASR_ACCESS_TOKEN`，并额外设置 `VOLC_ASR_USE_LEGACY=1`。默认情况下旧版字段不会被使用，避免误连到旧控制台。

## 平台接入

课件会从 URL 读取：

```text
launchToken
platformApiBase
returnUrl
```

启动时调用：

```text
POST /course-runtime/launch/verify
```

完成时依次调用：

```text
POST /course-runtime/launch/artifacts
POST /course-runtime/launch/records
```

上传作品包括学生录音、4 套候选漫画图、选中漫画、WebVTT 字幕和最终 mp4 视频。视频合成接口支持 `bgmMood: "soft" | "fast"`，分别使用内置 MP3 素材 `nastelbom-asian-asian-china-chinese-music-501705` 和 `nastelbom-chinese-new-year-455963`；素材缺失时才回退到 ffmpeg 本地生成音。

自定义投屏页：

```text
POST /api/projector/save
GET /projector/:workId
```

投屏页展示学生原声录音、4 套候选漫画、已选漫画和最终视频。提交成绩时会把 `summary.projectorUrl` 和 `summary.screenUrl` 一并上报，底座可优先打开自定义投屏页；关键录音、漫画和视频仍会按附件上传到底座。

## 打包

```bash
cd coursewares/four-panel-story-studio
zip -r ../../four-panel-story-studio-current.zip manifest.json README.md static server \
  -x "*/node_modules/*" "*/.git/*" "*/.DS_Store" "*/.env" "*/.env.local"
```

上传 ZIP 前请确认包内不包含 `.env`、`.env.local`、API Key、Access Token 或临时生成文件。
