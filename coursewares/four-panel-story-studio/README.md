# AI 四格故事工坊

这是接入“智美教育新生态业务底座”的网页 + 服务课件。学生录制一段故事灵感语音，课件将它整理成起承转合四格漫画脚本，生成 4 套不同风格的整页四格漫画候选，并把学生原声、字幕、背景音乐和选中的漫画合成短视频。远程 API 偶发失败时，课件会保留已成功结果，并支持从失败步骤继续。

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

2. 在 `.env.local` 中填写火山方舟和豆包语音识别配置。`COURSEWARE_PUBLIC_BASE_URL` 必须是火山云端可访问的稳定公网 HTTPS 地址，不能是 `localhost`，也不建议使用会随时断开的临时隧道作为课堂正式地址。

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
COURSEWARE_COMIC_CONCURRENCY=2
COURSEWARE_REMOTE_RETRY_ATTEMPTS=3
COURSEWARE_REMOTE_RETRY_BASE_MS=700
COURSEWARE_REMOTE_TIMEOUT_MS=45000
COURSEWARE_IMAGE_TIMEOUT_MS=300000
COURSEWARE_IMAGE_DOWNLOAD_TIMEOUT_MS=90000
COURSEWARE_DATA_DIR
PORT
```

`ARK_API_KEY` 是火山方舟的 API Key，用来调用豆包语言模型和 Seedream 图片模型。

`VOLC_ASR_API_KEY` 是豆包语音新版控制台的 API Key，用来调用录音文件识别标准版 HTTP。新版接口使用请求头 `X-Api-Key`，不需要填写旧版 `APP ID` / `Access Token`。

`VOLC_ASR_RESOURCE_ID` 一般可以留空。留空时服务端会自动先试录音文件识别 2.0 的 `volc.seedasr.auc`，如果返回 `requested resource not granted`，再试录音文件识别 1.0 的 `volc.bigasr.auc`。如果你确定账号只开通了其中一个，可以手动指定。

`COURSEWARE_PUBLIC_BASE_URL` 必须是火山 ASR 可以访问到的地址，服务端会把录音转成 mp3 后通过 `/media/...` 暴露给 ASR。没有配置时，ASR 接口会返回明确错误。

`COURSEWARE_COMIC_CONCURRENCY` 默认是 `2`。如果 Seedream 偶发 429、排队超时或课堂网络不稳，可以临时降到 `1`；如果服务稳定再评估升高。

`COURSEWARE_REMOTE_RETRY_ATTEMPTS` 默认是 `3`，含首次请求和最多 2 次自动重试。服务端只会重试网络错误、超时、429 和 5xx；API Key、权限、400 参数错误和最终内容风控不会反复重试。

`COURSEWARE_IMAGE_TIMEOUT_MS` 默认是 `300000`，课堂上可按实际排队情况提高到 `420000`。

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

## 失败恢复和排查

每次作品生成都会创建 `generationId`，服务端在本地 JSON meta 中记录 `audio`、`asr`、`story`、`comics`、`video`、`submit` 的状态、耗时、错误码、模型和资源信息。

```text
GET /api/generations/:generationId
```

学生端会把 `generationId` 和阶段结果暂存在浏览器本地。刷新后可以恢复“录音已保存、故事已生成、漫画部分成功、视频待合成”等状态。

失败时的课堂动作：

- ASR 临时失败：保留录音，点击“重新识别”；若提示未检测到有效语音，则靠近麦克风重新录音。
- 故事整理失败：点击“重试故事”。
- 4 张漫画中 1-2 张失败：至少成功 2 张即可继续；失败卡片可点击“补生成”。
- 视频合成失败：保留录音和漫画，点击“重新合成视频”。
- 平台提交失败：保留视频和投屏页，点击“重新提交”。

## 打包

```bash
cd coursewares/four-panel-story-studio
zip -r ../../four-panel-story-studio-current.zip manifest.json README.md static server \
  -x "*/node_modules/*" "*/.git/*" "*/.DS_Store" "*/.env" "*/.env.local"
```

上传 ZIP 前请确认包内不包含 `.env`、`.env.local`、API Key、Access Token 或临时生成文件。
