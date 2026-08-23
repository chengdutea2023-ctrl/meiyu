# 猜拳识别实验室：认识判别式 AI

这是接入“智美教育新生态业务底座”的静态内部课件。

## 课件目标

学生通过摄像头和 AI 进行 5 回合猜拳擂台。课件使用 MediaPipe 手部关键点和自研 RPS 分类器识别学生出拳，并通过战报理解判别式 AI 的边界：模型是在有限类别里做判断，并不等于什么都认识。

## 本地预览

```bash
cd coursewares/rps-discriminative-ai
python3 -m http.server 4178
```

访问：

```text
http://localhost:4178/static/index.html?demo=1
```

`demo=1` 只用于本地预览，不会提交成绩或训练样本到底座。

## 模型文件

课件本地打包以下运行资产：

```text
static/vendor/mediapipe/vision_bundle.mjs
static/vendor/mediapipe/wasm/*
static/models/hand-landmarker/hand_landmarker.task
static/models/rps-keypoint-classifier/rps-classifier.json
```

当前 `rps-classifier.json` 是基于关键点规则的 bootstrap 分类器，用于改善第一版识别并采集真实失败样本。正式大规模使用前，应导出真实课堂样本，离线训练轻量分类器后替换该 JSON 文件。

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

学生主动保存失败样本时调用：

```text
POST /course-runtime/launch/artifacts
```

完成时调用：

```text
POST /course-runtime/launch/records
```

摄像头画面不会自动保存。只有学生或老师点击“保存为训练样本”并选择正确标签后，才会上传压缩截图和识别摘要。

## 打包

```bash
cd coursewares/rps-discriminative-ai
zip -r ../../rps-discriminative-ai-current.zip manifest.json README.md static \
  -x "*/node_modules/*" "*/.git/*" "*/.DS_Store" "*/.env"
```

上传 ZIP 前请确认包内不包含旧的 Teachable Machine/TensorFlow.js 临时模型。
