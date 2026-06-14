# 课件开发规范

版本：v2
更新日期：2026-06-14
适用对象：内部课件开发者、使用 Codex 开发课件的团队成员

> 内部课件开发统一交付文档已经收敛到 `docs/14-courseware-integration-whitepaper-v2.md`。项目负责人给课件开发者发 14 号白皮书即可。
> 本文档保留为平台维护者参考的底层规范，不再作为单独发给开发者的主文档。

本文档是当前业务底座课件开发的基础规范。旧的第三方独立站 / SSO 接入方式仍保留在 `docs/08-third-party-course-integration-whitepaper.md`，但新课件优先按 `docs/14-courseware-integration-whitepaper-v2.md` 接入课程运行区。

## 1. 基本边界

课件是业务底座里的学习内容，不是独立用户系统。

课件不能做：

- 不做学生注册。
- 不做教师注册。
- 不做登录、找回密码、重置密码。
- 不保存底座账号密码。
- 不直接连接底座数据库。
- 不假造 `studentId`、`classId`、`assignmentId`。
- 不写死 `data.docpine.online`、`localhost`、`127.0.0.1`、固定端口或服务器密钥。

课件必须做：

- 从学生后台进入。
- 读取启动 URL 中的 `launchToken`、`platformApiBase`、`returnUrl`。
- 使用 `launchToken` 校验当前学生、班级、课程、课件和任务。
- 完成学习时上报成绩、耗时和摘要。
- 页面中提供明显的“返回学生后台”或“返回我的课程”按钮。

## 2. 课程与课件

底座采用两层结构：

| 层级 | 含义 | 示例 |
| --- | --- | --- |
| 课程 | 教学主题容器，老师布置给班级的是整门课程 | 机器真的能学习吗？ |
| 课件 | 课程下面的具体互动程序，每个课件独立 ZIP、manifest、部署状态和学习记录 | 你猜我画 |

课件访问结构保持稳定：

```text
线上：http://agent.docpine.online/{courseSlug}/{coursewareSlug}/
本地：http://localhost:3000/{courseSlug}/{coursewareSlug}/
```

`courseSlug` 和 `coursewareSlug` 由底座用于生成访问地址。管理员后台现在会自动生成课件访问短名，开发者不需要让运营人员手工填写。

## 3. 课件类型

### 3.1 网页课件 `STATIC`

适合：

- 展示内容。
- 选择题、拖拽题、简单互动。
- 前端直接计算分数。
- 不需要长期保存作品、录音、视频或复杂过程数据。

目录：

```text
courseware.zip
  manifest.json
  static/
    index.html
    app.js
    styles.css
    assets/
    vendor/
```

### 3.2 服务课件 `NODE`

适合：

- 课件主要由 Node 服务渲染或提供接口。
- 需要保存作品、过程数据、投屏页面。

目录：

```text
courseware.zip
  manifest.json
  server/
    package.json
    server.js
```

### 3.3 网页 + 服务课件 `BOTH`

推荐用于画作、录音、AI 对话、投屏等复杂课件。

目录：

```text
courseware.zip
  manifest.json
  static/
    index.html
    app.js
    assets/
    vendor/
  server/
    package.json
    server.js
```

如果课件需要保存学生画作、录音、视频、投屏页面或复杂过程数据，必须使用 `NODE` 或 `BOTH`，不要做成纯静态课件。

## 4. manifest.json

每个 ZIP 根目录必须包含 `manifest.json`。

示例：

```json
{
  "slug": "guess-my-drawing",
  "title": "你猜我画",
  "runtimeType": "BOTH",
  "entry": "/",
  "nodePort": null,
  "permissions": {
    "needsStudentIdentity": true,
    "storesArtifacts": true,
    "supportsProjector": true
  }
}
```

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `slug` | 建议 | 开发者建议的课件短名。后台可自动生成最终短名，上传后以后台识别结果为准 |
| `title` | 是 | 课件名称 |
| `runtimeType` | 是 | `STATIC`、`NODE`、`BOTH` |
| `entry` | 是 | 通常填写 `/` |
| `nodePort` | 否 | 默认填 `null`，由底座自动分配；不要写死 `4102` |
| `permissions.needsStudentIdentity` | 建议 | 是否需要学生身份 |
| `permissions.storesArtifacts` | 建议 | 是否保存图片、录音、视频、作品或过程数据 |
| `permissions.supportsProjector` | 建议 | 是否支持投屏页面 |

注意：

- 管理员后台不再要求人工填写课件访问短名、运行方式、Node 端口和课件入口。
- 运行方式由 ZIP 和 manifest 自动识别。
- Node 端口由底座自动分配。
- 开发者可以在 manifest 中给出 `slug` 建议，但不要依赖它作为唯一事实。

## 5. 标准启动流程

课件不能直接打开后自行判断学生身份。标准流程是：

```text
学生登录学生后台
  -> 查看我的任务
  -> 进入课程
  -> 选择课件
  -> 底座检查课程已开始、课件已开放
  -> 底座生成 launchToken
  -> 跳转到课件 URL，并携带 launchToken、platformApiBase、returnUrl
  -> 课件校验 launchToken
  -> 课件获得学生、班级、任务、课程和课件上下文
  -> 课件完成学习
  -> 课件上报成绩、附件和投屏入口
```

课件启动 URL 示例：

```text
http://agent.docpine.online/can-machines-learn/guess-my-drawing/?launchToken=xxx&platformApiBase=http%3A%2F%2Fdata.docpine.online%2Fapi%2Fv1&returnUrl=http%3A%2F%2Fstudent.docpine.online%2F
```

## 6. 前端必须读取的参数

课件前端必须这样读取启动参数：

```js
const searchParams = new URLSearchParams(window.location.search);
const launchToken = searchParams.get('launchToken');
const platformApiBase = searchParams.get('platformApiBase');
const returnUrl = searchParams.get('returnUrl');
```

不要这样写：

```js
const platformApiBase = 'http://data.docpine.online/api/v1';
const returnUrl = 'http://student.docpine.online';
```

推荐公共方法：

```js
function requireLaunchContext() {
  if (!launchToken || !platformApiBase) {
    throw new Error('请从学生后台进入课件');
  }
}

function backToStudentPortal() {
  if (returnUrl) {
    window.location.href = returnUrl;
    return;
  }
  window.history.back();
}

async function platformPost(path, body) {
  requireLaunchContext();
  const response = await fetch(`${platformApiBase}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || '底座接口请求失败');
  }
  return data;
}
```

页面必须有默认返回按钮：

```html
<button type="button" id="backToStudent">返回学生后台</button>
<script>
  document.querySelector('#backToStudent').addEventListener('click', backToStudentPortal);
</script>
```

## 7. 校验 launchToken

课件启动后先校验：

```js
const launchContext = await platformPost('/course-runtime/launch/verify', {
  launchToken,
});
```

返回内容包含：

```text
student      当前学生
course       当前课程
courseware   当前课件
assignment   当前排课任务
class        当前班级和学校
```

课件保存数据时，只能使用校验返回的身份和上下文，不要相信前端自己传来的学生身份。

## 8. 上报学习记录和成绩

最终提交时调用：

```js
await platformPost('/course-runtime/launch/records', {
  launchToken,
  status: 'COMPLETED',
  score: 92,
  durationSeconds: 480,
  summary: {
    brief: '学生完成你猜我画挑战',
    workId: 'work_abc123',
    artifactUrl: '/work/work_abc123',
    projectorUrl: '/projector/work_abc123',
    imageUrl: '/work/work_abc123/image.png',
  },
});
```

`status` 可选：

```text
STARTED
PROGRESS
COMPLETED
```

规则：

- 学生进入课件时，底座会自动记录 `STARTED`。
- 阶段保存可以上报 `PROGRESS`。
- 点击“提交”“完成”“保存成绩”时，上报 `COMPLETED`。
- `score` 建议为 0-100。
- `durationSeconds` 单位为秒。
- 老师未开始课程、未开放课件、已关闭课件或已结束课程时，底座会拒绝新的进入或提交。

## 9. 上传附件

图片、录音、视频和作品文件可以通过底座附件接口保存。

```js
await platformPost('/course-runtime/launch/artifacts', {
  launchToken,
  fileName: 'drawing.png',
  mimeType: 'image/png',
  kind: 'drawing',
  contentBase64: 'base64-encoded-content',
  metadata: {
    scene: 'final-submit',
  },
});
```

附件会绑定到当前学生、任务、课程、课件和学习记录。教师和学生后台只展示授权范围内的附件。

适合上传到底座附件的内容：

- 最终画作图片。
- 录音文件。
- 视频文件。
- 作品截图。
- 可留档的结果文件。

不适合直接塞进 `summary` 的内容：

- 很大的图片 base64。
- 很长的录音或视频 base64。
- 大量逐帧过程数据。

大文件和复杂过程数据可以放在课件 Node 服务或对象存储中，底座只保存入口 URL 和摘要。

## 10. 画作类课件要求

“你猜我画”这类课件必须至少做到：

- 保存最终作品图片，格式可以是 PNG、WebP 或 JPEG。
- 保存关键过程数据，例如笔画轨迹、识别结果、用时和最终答案。
- 有最终提交按钮。
- 提交后上报 `COMPLETED`、`score`、`durationSeconds`。
- `summary` 中包含 `workId`、`imageUrl`、`artifactUrl` 或 `projectorUrl`。
- 如果支持课堂投屏，必须提供 `projectorUrl` 或 `screenUrl`。

只保存分数、不保存最终图片，不算完整教学留档。

## 11. 投屏页面

投屏页面由课件自己负责展示效果，底座只负责保存入口。

如果课件支持投屏，上报时写入：

```json
{
  "summary": {
    "projectorUrl": "http://agent.docpine.online/can-machines-learn/guess-my-drawing/projector/work_abc123"
  }
}
```

也可以使用：

```json
{
  "summary": {
    "screenUrl": "http://agent.docpine.online/can-machines-learn/guess-my-drawing/projector/work_abc123"
  }
}
```

教师后台会优先使用 `projectorUrl` 或 `screenUrl` 打开投屏。

## 12. 外部依赖

正式 ZIP 不允许依赖外部 CDN、Google Fonts、unpkg、jsdelivr 或远程图片/模型。

不允许：

```html
<script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs"></script>
<link href="https://fonts.googleapis.com/css2?family=..." rel="stylesheet" />
```

允许：

```html
<script src="./vendor/tf.min.js"></script>
<link href="./assets/app.css" rel="stylesheet" />
```

所有前端库、图片、音频、字体、模型文件都必须随 ZIP 本地交付。

## 13. ZIP 交付检查

交付前必须检查：

- ZIP 根目录有 `manifest.json`。
- 静态课件有 `static/index.html`。
- Node/BOTH 课件有 `server/package.json`。
- `node_modules/`、`.git/`、`.env`、服务器密码、数据库密码没有打包。
- 没有外部 CDN 依赖。
- 没有登录、注册、找回密码、重置密码 UI。
- 没有写死 `data.docpine.online`、`localhost`、`127.0.0.1` 或固定端口。
- 能读取 `launchToken`、`platformApiBase`、`returnUrl`。
- 能校验 `launchToken`。
- 有返回学生后台按钮。
- 有最终提交按钮。
- 能上报 `COMPLETED`。
- 需要留档的课件能上传附件或提供作品入口。
- 需要投屏的课件能提供 `projectorUrl` 或 `screenUrl`。

## 14. 管理员上线流程

```text
1. 管理员创建课程。
2. 管理员创建课件，只填写业务信息。
3. 管理员上传课件 ZIP。
4. 底座自动识别 manifest、运行类型、入口地址和 Node 端口。
5. 静态课件可直接发布。
6. Node/BOTH 课件部署成功后发布。
7. 管理员把课件加入课程。
8. 管理员把课程排给班级和负责老师。
9. 老师开始课程，并按课件逐个开放。
10. 学生进入课件学习。
11. 成绩、附件和投屏入口回流到底座。
```

## 15. 常见错误

### 15.1 直接打开课件没有成绩

原因：没有 `launchToken`。必须从学生后台进入。

### 15.2 本地课件请求到了线上 API

原因：代码写死了 `http://data.docpine.online/api/v1`。必须读取 URL 中的 `platformApiBase`。

### 15.3 点击提交后提示 token 无效

常见原因：

- 不是从学生后台进入。
- 旧页面缓存了过期 URL。
- 课程未开始或课件未开放。
- 课件把请求发到了错误环境的 API。

### 15.4 课件部署端口冲突

原因：manifest 写死了固定端口。`nodePort` 默认填 `null`，由底座自动分配。

### 15.5 教师看不到作品或投屏

原因：课件只上报了分数，没有上传附件，也没有在 `summary` 里提供 `artifactUrl`、`projectorUrl` 或 `screenUrl`。
