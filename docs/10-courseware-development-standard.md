# 课件开发规范

本文档面向第三方课件开发者。新课件优先部署到课程运行区：

```text
http://agent.docpine.online/{courseSlug}/
```

底座负责统一账号、教师、学生、学校、班级、课程、任务和学习记录。课件负责具体教学互动、作品保存和展示。

## 1. 课件类型

### 静态课件

适合纯前端互动：

- 展示内容。
- 简单练习。
- 前端计算分数。
- 调用底座接口上报完成状态和成绩。

目录：

```text
{courseSlug}/
  manifest.json
  static/
    index.html
    assets/
```

### Node 课件

适合需要课件自己保存业务数据的场景：

- 学生画作。
- 录音。
- AI 对话过程。
- 投屏页面。
- 教师查看作品详情。
- 复杂练习记录。

目录：

```text
{courseSlug}/
  manifest.json
  static/
  server/
    package.json
    src/
```

Node 服务只能监听 `127.0.0.1:{nodePort}`，由 Nginx 代理到：

```text
http://agent.docpine.online/{courseSlug}/api/
```

## 2. manifest.json

```json
{
  "slug": "can-machines-learn",
  "title": "机器真的能学习吗？",
  "runtimeType": "BOTH",
  "entry": "/",
  "nodePort": 4101,
  "permissions": {
    "needsStudentIdentity": true,
    "storesArtifacts": true,
    "supportsProjector": true
  }
}
```

`slug` 必须和底座管理员后台登记的课程 slug 一致。

## 3. 标准启动流程

课件不能自己判断学生是谁。学生必须从底座学生后台进入课件。

```text
学生登录 student.docpine.online
  -> 点击课程任务
  -> 底座生成 launchToken
  -> 跳转 agent.docpine.online/{courseSlug}/?launchToken=xxx
  -> 课件校验 launchToken
  -> 课件拿到学生、班级、任务、课程上下文
  -> 课件保存自己的业务数据
  -> 课件向底座上报学习记录和成绩
```

## 4. 校验 launchToken

请求：

```http
POST http://data.docpine.online/api/v1/course-runtime/launch/verify
Content-Type: application/json

{
  "launchToken": "launch-token"
}
```

返回里会包含：

```text
student     当前学生
course      当前课程
assignment  当前任务
class       当前班级和学校
```

课件保存数据时，应使用这些底座 ID：

```text
student.id
course.slug
assignment.id
class.id
```

## 5. 上报学习记录

请求：

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

`status` 可选：

```text
STARTED
PROGRESS
COMPLETED
```

学生点击任务进入课件时，底座已经自动记录 `STARTED`。课件通常只需要上报 `PROGRESS` 和 `COMPLETED`。

## 6. 作品和投屏数据

如果课件需要保存学生作品，第一版建议：

```text
课件自己的数据库保存详细作品。
底座保存作品入口和成绩摘要。
```

例如画画课件：

```text
课件数据库：
- artworkId
- studentId
- assignmentId
- imageUrl
- strokeData
- createdAt

底座 learningRecord.summary：
- artworkUrl
- projectorUrl
- brief
```

这样教师后台可以先看到统一学习记录；点击作品入口时，再进入课件自己的作品详情或投屏页面。

## 7. 开发者不能做的事

- 不能保存底座账号密码。
- 不能要求学生在课件里重新注册底座账号。
- 不能直接访问底座数据库。
- 不能把底座管理员账号、服务器 root、数据库密码写进课件。
- 不能在前端保存长期密钥。
- 不能假造 studentId，应以 launchToken 校验结果为准。

## 8. 管理员上线流程

```text
1. 管理员在 data.docpine.online 创建课程。
2. 设置 slug、标题、运行方式和入口。
3. 上传开发者交付的课件 ZIP。
4. 系统解压、校验 manifest，并写入课程运行目录。
5. 静态课件可直接发布；Node 课件先进入待部署状态。
6. Node 课件由管理员在后台一键部署或重启。
7. 管理员测试 agent.docpine.online/{courseSlug}/。
8. 教师在 teacher.docpine.online 给班级布置任务。
9. 学生在 student.docpine.online 进入课件。
```

Node 课件由底座后台按 manifest 中的 `nodePort` 启动，课件进程只能监听 `127.0.0.1:{nodePort}`。开发者不需要、也不应获得服务器 root 权限。
