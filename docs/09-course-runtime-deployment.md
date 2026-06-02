# 课程课件运行区部署说明

本文档说明课程开发者如何把课程/课件程序交付到业务底座服务器。

## 线上入口

```text
课程运行区：http://agent.docpine.online/{courseSlug}/
服务器目录：/opt/zhimei-education-platform/courses/{courseSlug}/
```

`courseSlug` 必须和底座后台“课程课件”中登记的 `slug` 一致，例如：

```text
课程名：机器真的能学习吗？
slug：can-machines-learn
入口：http://agent.docpine.online/can-machines-learn/
目录：/opt/zhimei-education-platform/courses/can-machines-learn/
```

## 目录结构

每个课程目录必须包含 `manifest.json`。

静态课程：

```text
/opt/zhimei-education-platform/courses/can-machines-learn/
  manifest.json
  static/
    index.html
    assets/
```

Node 课程：

```text
/opt/zhimei-education-platform/courses/can-machines-learn/
  manifest.json
  server/
    package.json
    server.js
```

同时包含静态页面和 Node 服务：

```text
/opt/zhimei-education-platform/courses/can-machines-learn/
  manifest.json
  static/
  server/
```

## manifest.json

```json
{
  "slug": "can-machines-learn",
  "title": "机器真的能学习吗？",
  "runtimeType": "STATIC",
  "entry": "/",
  "nodePort": null
}
```

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `slug` | 是 | 课程唯一短名，和底座课程登记一致 |
| `title` | 是 | 课程名称 |
| `runtimeType` | 是 | `STATIC`、`NODE`、`BOTH` |
| `entry` | 是 | 静态课程入口，一般为 `/` |
| `nodePort` | Node 课程必填 | Node 服务监听端口，只允许监听 `127.0.0.1` |

## 静态课程要求

- 构建结果放入 `static/`。
- 静态入口必须能通过 `http://agent.docpine.online/{courseSlug}/` 打开。
- 静态课程前端调用底座 API 时使用：

```text
http://data.docpine.online/api/v1
```

学生不能直接打开裸课程入口。标准入口由学生后台生成：

```text
http://agent.docpine.online/{courseSlug}/?launchToken=xxx
```

课件用 `launchToken` 向底座换取学生、班级、任务上下文。

## Node 课程要求

- Node 服务放入 `server/`。
- 只能监听 `127.0.0.1:{nodePort}`。
- Nginx 将代理：

```text
http://agent.docpine.online/{courseSlug}/api/
  -> http://127.0.0.1:{nodePort}/
```

- Node 服务不能保存底座用户密码。
- Node 服务如需识别用户，应使用课程启动 `launchToken` 调用底座 API 校验。
- Node 课件详细业务数据可以保存在自己的课件服务中，例如学生画作、录音、投屏状态；底座只保存学习记录和作品索引。

## 课程启动凭证

学生在 `student.docpine.online` 点击课程任务后，底座会生成短期 `launchToken` 并跳转到课件。

课件启动后先调用：

```http
POST http://data.docpine.online/api/v1/course-runtime/launch/verify
Content-Type: application/json

{
  "launchToken": "launch-token"
}
```

返回上下文示例：

```json
{
  "context": {
    "launchSessionId": "session-id",
    "student": {
      "id": "student-id",
      "email": "student@example.com",
      "displayName": "学生姓名",
      "ageBand": "6-12岁"
    },
    "course": {
      "id": "course-id",
      "slug": "can-machines-learn",
      "title": "机器真的能学习吗？"
    },
    "assignment": {
      "id": "assignment-id",
      "title": "第一课学习任务"
    },
    "class": {
      "id": "class-id",
      "name": "一班",
      "organization": {
        "id": "school-id",
        "name": "示例学校"
      }
    }
  },
  "reportEndpoint": "/api/v1/course-runtime/launch/records"
}
```

## 学习记录上报

课件应在进度变化、完成学习时调用：

```http
POST http://data.docpine.online/api/v1/course-runtime/launch/records
Content-Type: application/json

{
  "launchToken": "launch-token",
  "status": "COMPLETED",
  "score": 92,
  "durationSeconds": 480,
  "summary": {
    "artworkUrl": "http://agent.docpine.online/can-machines-learn/work/abc123",
    "projectorUrl": "http://agent.docpine.online/can-machines-learn/projector/abc123",
    "comment": "完成互动练习"
  }
}
```

`status` 可选值：

```text
STARTED
PROGRESS
COMPLETED
```

学生点击课程任务时，底座会自动记录一次 `STARTED`。课件可以继续上报 `PROGRESS` 和 `COMPLETED`。

## 管理员后台上传课件

管理员后台“课程课件”支持上传课程 ZIP，并由底座完成 manifest 校验、静态课件发布和 Node 课件部署状态管理。

- 管理员先在后台创建课程，设置 `slug`、课程名、运行方式和入口。
- 点击“上传 ZIP”，选择开发者交付的课件压缩包。
- 系统自动解压到服务器课程目录，并拒绝 `node_modules`、`.git`、`.env` 等高风险内容。
- 系统读取并校验 `manifest.json`，后台可直接查看 manifest、校验错误、服务器目录和部署日志。
- 静态课件校验通过后，可勾选“校验通过后发布课程”，系统直接发布。
- Node 课件校验通过后进入“待部署”，管理员可点击“一键部署”或“重启”。
- 一键部署会执行依赖安装、可选 Prisma 生成/迁移、构建和启动；部署成功后课程自动发布。

课程目录建议：

```text
can-machines-learn/
  manifest.json
  static/
    index.html
    assets/
  server/
    package.json
    src/
```

后台上传接口：

```http
POST http://data.docpine.online/api/v1/courses/{courseId}/zip
```

查看 manifest 与校验结果：

```http
GET http://data.docpine.online/api/v1/courses/{courseId}/manifest
```

查看 Node 课件部署状态：

```http
GET http://data.docpine.online/api/v1/courses/{courseId}/runtime-status
```

一键部署 / 重启 Node 课件：

```http
POST http://data.docpine.online/api/v1/courses/{courseId}/deploy
POST http://data.docpine.online/api/v1/courses/{courseId}/restart
```

服务器环境变量：

```text
COURSE_RUNTIME_ROOT=/opt/zhimei-education-platform/courses
COURSE_UPLOAD_MAX_BYTES=83886080
REQUEST_BODY_LIMIT=120mb
COURSE_LAUNCH_TOKEN_TTL_SECONDS=3600
```

## 开发者交付规则

- 开发者只上传自己课程目录下的文件。
- 不提供服务器 root 权限。
- 课程上线前，管理员需要在底座后台“课程课件”中登记并发布课程。
- 课程发布后，教师才能把它布置给自己的班级。
- 学生只能看到自己班级已布置的课程任务。
