# 智美教育新生态业务底座内部课件开发统一技术白皮书

版本：v2
更新日期：2026-06-14
适用对象：内部课件开发者、使用 Codex 开发课件的团队成员、课程内容团队

本文档是内部课件开发者唯一需要阅读和遵守的交付白皮书。项目负责人给开发者或开发者的 Codex 发这一份即可，不需要同时发送 08、10、13 号文档。

本文档用于指导开发者把课件接入“智美教育新生态业务底座”。如果开发者在异地或使用 Codex 开发，可以直接把本文档作为主要提示词上下文。

其他相关文档的定位：

- `docs/08-third-party-course-integration-whitepaper.md`：旧第三方独立站 / SSO 接入兼容说明，不作为内部课件开发主文档。
- `docs/10-courseware-development-standard.md`：平台维护者参考的底层规范。
- `docs/13-internal-courseware-developer-handoff.md`：历史交接说明和补充参考。

## 1. 一句话原则

```text
账号、班级、课程任务、权限和学习记录归业务底座；
课件负责具体学习互动和数据上报；
业务底座统一保存成绩、附件和可展示数据，并生成默认投屏页。
```

课件不是独立用户系统，不能做登录、注册、找回密码、重置密码，也不能保存底座账号密码。

## 2. 四个线上入口

```text
管理员后台：http://data.docpine.online
教师后台：http://teacher.docpine.online
学生后台：http://student.docpine.online
课件运行区：http://agent.docpine.online
```

课件正式运行地址：

```text
http://agent.docpine.online/{courseSlug}/{coursewareSlug}/
```

本地调试地址：

```text
http://localhost:3000/{courseSlug}/{coursewareSlug}/
```

开发者不要在代码里写死这些地址。学生进入课件时，底座会通过 URL 参数把真实 API 地址和返回地址传进来。

## 3. 课程与课件关系

| 名称 | 含义 | 示例 |
| --- | --- | --- |
| 课程 Course | 教学主题容器，老师布置的是整门课程 | 机器真的能学习吗？ |
| 课件 Courseware | 课程下的具体互动内容，每个课件独立 ZIP、部署和记录 | 你猜我画 |

老师在教师后台开始整门课程后，还可以逐个开放课件。学生能看到课件列表，但只有老师开放后的课件才能进入。

## 4. 课件类型选择

### 4.1 网页课件

适合简单互动：

- 选择题。
- 拖拽题。
- 简单游戏。
- 前端能直接算分。
- 不需要复杂服务端过程计算。

网页课件也必须支持统一成绩记录和默认投屏。做法是：完成时上报 `score`、`durationSeconds` 和可展示的 `summary`；如果有图片、录音、视频或文件，先上传到底座附件接口，再把附件结果写入 `summary`。

`manifest.runtimeType` 使用：

```json
"STATIC"
```

### 4.2 服务课件

适合服务端主导的课件：

- 课件自己渲染页面。
- 需要服务端保存数据。
- 需要生成自定义作品页或自定义投屏页。

`manifest.runtimeType` 使用：

```json
"NODE"
```

### 4.3 网页 + 服务课件

推荐给复杂互动课件：

- 画作。
- 录音。
- 视频。
- AI 对话。
- 模型识别过程。
- 作品详情页。
- 自定义投屏页面。

`manifest.runtimeType` 使用：

```json
"BOTH"
```

“你猜我画”这类画作课件建议使用 `BOTH`。

## 5. 标准 ZIP 结构

### 网页课件

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

### 网页 + 服务课件

```text
courseware.zip
  manifest.json
  static/
    index.html
    app.js
    styles.css
    assets/
    vendor/
  server/
    package.json
    server.js
```

不要打包：

```text
node_modules/
.git/
.env
.DS_Store
服务器密码
数据库密码
管理员密码
APP_SECRET
```

## 6. manifest.json

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

规则：

- `title` 是课件名称。
- `runtimeType` 必须是 `STATIC`、`NODE` 或 `BOTH`。
- `entry` 通常填 `/`。
- `nodePort` 默认填 `null`，由底座自动分配。
- `slug` 可以作为建议短名，但最终短名以后台自动生成和识别为准。
- 不要写死 `4102` 之类固定端口。

## 7. 学生进入课件的标准流程

```text
学生登录学生后台
  -> 点击我的任务
  -> 进入课程
  -> 选择课件
  -> 底座确认课程已开始、课件已开放
  -> 底座生成 launchToken
  -> 跳转到课件，并携带 launchToken、platformApiBase、returnUrl
  -> 课件校验 launchToken
  -> 课件开始学习
  -> 课件上报成绩、附件和投屏入口
```

启动 URL 示例：

```text
http://agent.docpine.online/can-machines-learn/guess-my-drawing/?launchToken=xxx&platformApiBase=xxx&returnUrl=xxx
```

开发者必须读取这三个参数：

| 参数 | 用途 |
| --- | --- |
| `launchToken` | 用来校验当前学生和本次任务 |
| `platformApiBase` | 底座 API 地址，本地和线上不同 |
| `returnUrl` | 返回学生后台或课程页 |

## 8. 前端基础代码

```js
const searchParams = new URLSearchParams(window.location.search);
const launchToken = searchParams.get('launchToken');
const platformApiBase = searchParams.get('platformApiBase');
const returnUrl = searchParams.get('returnUrl');

function requireLaunchContext() {
  if (!launchToken || !platformApiBase) {
    throw new Error('请从学生后台进入课件');
  }
}

async function platformPost(path, body) {
  requireLaunchContext();
  const response = await fetch(`${platformApiBase}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || '底座接口请求失败');
  return data;
}

function backToStudentPortal() {
  if (returnUrl) {
    window.location.href = returnUrl;
    return;
  }
  window.history.back();
}
```

业务底座会在学生启动课件时，根据 `returnUrl` 自动注入一个“返回学生后台”浮动按钮。开发者仍然可以在课件 UI 内额外提供一个更贴合设计的返回按钮：

```html
<button type="button" id="backToStudent">返回学生后台</button>
<script>
  document.querySelector('#backToStudent').addEventListener('click', backToStudentPortal);
</script>
```

不要写：

```js
const platformApiBase = 'http://data.docpine.online/api/v1';
const returnUrl = 'http://student.docpine.online';
```

## 9. 校验学生身份

课件启动后立即校验：

```js
const launch = await platformPost('/course-runtime/launch/verify', {
  launchToken,
});
```

返回中包含：

```text
student      当前学生
course       当前课程
courseware   当前课件
assignment   当前排课任务
class        当前班级和学校
```

课件保存作品、上报成绩时，只能使用校验结果里的身份和任务信息，不能相信前端手工传入的 `studentId`。

## 10. 上报学习成绩

学生最终提交时：

```js
const drawingArtifact = await platformPost('/course-runtime/launch/artifacts', {
  launchToken,
  fileName: 'drawing.png',
  mimeType: 'image/png',
  kind: 'drawing',
  contentBase64: 'base64-encoded-content',
  metadata: {
    scene: 'final-submit',
    title: '最终画作'
  },
});

await platformPost('/course-runtime/launch/records', {
  launchToken,
  status: 'COMPLETED',
  score: 90,
  durationSeconds: 360,
  summary: {
    displayTitle: '你猜我画作品',
    brief: '完成你猜我画课件，识别成功 8/10',
    scoreText: '90 分',
    workId: 'work_abc123',
    artifacts: [
      {
        kind: drawingArtifact.kind,
        title: '最终画作',
        url: drawingArtifact.url,
        mimeType: drawingArtifact.mimeType
      }
    ],
    resultItems: [
      { label: '识别成功', value: '8/10' },
      { label: '用时', value: '6 分钟' }
    ],
    processSummary: '学生完成 10 轮绘画识别，其中 8 轮识别正确。'
  },
});
```

`status`：

- `STARTED`：开始。
- `PROGRESS`：阶段进度。
- `COMPLETED`：完成提交。

底座会把成绩显示到学生后台和教师后台。

## 11. 上传附件

如果要把图片、录音、视频、作品文件保存到底座，调用：

```js
const artifact = await platformPost('/course-runtime/launch/artifacts', {
  launchToken,
  fileName: 'drawing.png',
  mimeType: 'image/png',
  kind: 'drawing',
  contentBase64: 'base64-encoded-content',
  metadata: {
    scene: 'final-submit',
    title: '最终画作'
  },
});
```

附件会绑定到当前学生、本次任务、课程和课件。学生只能看自己的附件，负责老师能看本班任务下的附件。

建议：

- 需要在教师后台、学生后台、默认投屏页里展示的图片、录音、视频和文件，必须上传到底座附件接口。
- 小型最终作品图片、答题结果 JSON、过程摘要 JSON 可以直接上传到底座。
- 录音、视频可以上传到底座，但要注意大小限制。
- 大量模型中间结果、超大文件可以保存在课件 Node 服务或对象存储中，但必须在 `summary` 里提供可访问入口。
- 上传附件后，把返回的 `artifact.url`、`artifact.kind`、`artifact.mimeType` 写入 `summary.artifacts`，方便底座默认投屏页展示。

## 12. 投屏规范

### 12.1 默认规则：底座统一生成投屏页

从本版本开始，所有课件都按“业务底座统一生成默认投屏页”作为标准能力。

课件不再必须自己开发投屏页。课件只需要在完成提交时，把可展示数据交给底座：

- 分数：`score`
- 耗时：`durationSeconds`
- 简短说明：`summary.brief`
- 作品标题：`summary.displayTitle`
- 结构化结果：`summary.resultItems`
- 答题明细：`summary.answers`
- 附件列表：`summary.artifacts`
- 过程摘要：`summary.processSummary`

底座教师后台会根据学习记录、`summary` 和附件自动生成统一投屏页。这个默认投屏页适用于静态课件、服务课件和网页+服务课件。

最低要求：

```json
{
  "score": 90,
  "durationSeconds": 360,
  "summary": {
    "displayTitle": "哪些是 AI 工具",
    "brief": "答对 9/10 题",
    "scoreText": "90 分",
    "resultItems": [
      { "label": "正确题数", "value": "9/10" },
      { "label": "完成情况", "value": "已完成" }
    ]
  }
}
```

如果课件有图片、画作、录音、视频或文件，必须先调用 `/course-runtime/launch/artifacts` 上传到底座，再把返回结果写入：

```json
{
  "summary": {
    "artifacts": [
      {
        "kind": "drawing",
        "title": "最终画作",
        "url": "http://data.docpine.online/api/v1/course-runtime/artifacts/artifact_id/file",
        "mimeType": "image/png"
      }
    ]
  }
}
```

### 12.2 可选增强：课件自定义投屏页

如果课件需要更强的舞台展示效果，可以额外提供自定义投屏页面。教师后台优先打开课件提供的自定义投屏页；没有自定义投屏页时，使用底座默认投屏页。

自定义投屏页通过 `summary.projectorUrl` 或 `summary.screenUrl` 上报：

```json
{
  "summary": {
    "projectorUrl": "http://agent.docpine.online/can-machines-learn/guess-my-drawing/projector/work_abc123"
  }
}
```

或：

```json
{
  "summary": {
    "screenUrl": "http://agent.docpine.online/can-machines-learn/guess-my-drawing/projector/work_abc123"
  }
}
```

自定义投屏页适合画作展示、互动作品展示、AI 对话剧场、课堂大屏展示等场景。即使提供了自定义投屏页，也仍然建议上传关键附件到底座，避免作品只存在课件服务临时目录里。

## 13. 画作类课件要求

以“你猜我画”为例，合格课件必须包含：

- 学生绘画页面。
- 最终提交按钮。
- 最终作品图片保存，格式为 PNG、WebP 或 JPEG。
- 可选过程数据：笔画轨迹、识别历史、每轮答案、模型置信度。
- 成绩计算。
- 学习耗时。
- 可选自定义作品详情页。
- 可选自定义投屏页。
- 完成后上报 `COMPLETED`、`score`、`durationSeconds`。
- 最终作品图片必须上传到底座附件接口。
- `summary` 包含 `displayTitle`、`brief`、`scoreText`、`resultItems`、`artifacts`。
- 如果有自定义投屏页，额外包含 `projectorUrl` 或 `screenUrl`。

不合格情况：

- 只在浏览器里临时显示作品，不保存。
- 只保存分数，不保存最终图片。
- 只提供课件自己的临时图片地址，没有把关键作品上传到底座。
- 只保存 localStorage。
- 没有提交按钮。
- 没有返回学生后台按钮。
- 写死线上 API，导致本地测试或线上迁移失败。

## 14. 教师开关课件规则

业务底座现在支持老师按课件单独开放和关闭：

- 老师开始整堂课后，所有课件默认关闭。
- 老师开放某个课件后，学生才能进入这个课件。
- 老师关闭课件后，学生不能再次进入，新的成绩提交也会被拒绝。
- 老师重新开始课程后，课件重新回到关闭状态。

课件不需要自己实现这套权限，但必须正确处理底座返回的错误提示。

## 15. 国内部署要求

课件最终部署在国内服务器，正式 ZIP 必须自包含。

禁止：

```text
https://cdn.jsdelivr.net/
https://unpkg.com/
https://fonts.googleapis.com/
远程图片
远程模型文件
```

允许：

```text
static/vendor/
static/assets/
static/models/
```

所有 JS、CSS、图片、音频、字体、模型文件都要放进 ZIP。

## 16. 交付前自测清单

开发者交付 ZIP 前逐项检查：

- 有 `manifest.json`。
- `runtimeType` 选择正确。
- 静态课件有 `static/index.html`。
- Node/BOTH 课件有 `server/package.json`。
- `nodePort` 为 `null`，没有写死固定端口。
- 没有 `node_modules/`、`.git/`、`.env`。
- 没有服务器密码、数据库密码、管理员密码、APP_SECRET。
- 没有登录、注册、找回密码、重置密码页面。
- 没有写死 `data.docpine.online`、`localhost`、`127.0.0.1`。
- 能读取 `launchToken`、`platformApiBase`、`returnUrl`。
- 底座默认返回按钮可用；如课件自己也做返回按钮，必须跳转 `returnUrl`。
- 没有 `launchToken` 时提示“请从学生后台进入课件”。
- 能调用 `/course-runtime/launch/verify`。
- 有最终提交按钮。
- 能调用 `/course-runtime/launch/records` 上报 `COMPLETED`。
- 需要保存作品时，能调用 `/course-runtime/launch/artifacts` 上传到底座。
- `summary` 包含适合底座默认投屏页展示的 `displayTitle`、`brief`、`scoreText`、`resultItems`。
- 有图片、录音、视频或文件时，`summary.artifacts` 包含底座附件 URL。
- 如果需要更强展示效果，可以额外提供 `projectorUrl` 或 `screenUrl`。
- 断开外网后核心功能仍能打开。

## 17. 给开发者 Codex 的提示词

把下面这段直接给开发者的 Codex：

```text
你现在要为“智美教育新生态业务底座”开发一个内部课件。

请严格按下面规则开发：

1. 这是课件，不是独立用户系统。
2. 学生和教师账号由业务底座管理，课件不做注册、登录、找回密码、重置密码。
3. 学生必须从学生后台进入课件。
4. 课件启动 URL 会带 launchToken、platformApiBase 和 returnUrl。
5. 前端必须读取这三个参数，不能写死 data.docpine.online、localhost、127.0.0.1 或固定端口。
6. 课件必须用 platformApiBase + /course-runtime/launch/verify 校验 launchToken。
7. 业务底座会自动注入“返回学生后台”按钮；课件也可以额外提供自己的返回按钮，但必须跳转 returnUrl，没有 returnUrl 时使用 history.back()。
8. 课件完成学习时，必须用 platformApiBase + /course-runtime/launch/records 上报 COMPLETED、score、durationSeconds 和 summary。
9. 所有课件都必须支持底座默认投屏页：summary 至少包含 displayTitle、brief、scoreText、resultItems 等可展示字段，不能只给一堆原始 JSON。
10. 如果课件需要保存图片、画作、录音、视频或文件，必须用 platformApiBase + /course-runtime/launch/artifacts 上传到底座，并把返回的附件 URL 写入 summary.artifacts。
11. 画作类课件必须保存最终 PNG/WebP/JPEG 图片，同时可以保存 strokeData、predictionHistory 等过程数据。
12. 如果课件需要更强的自定义投屏效果，可以额外提供 projectorUrl 或 screenUrl；没有提供时，底座会使用统一默认投屏页。
13. 所有写入接口必须校验 launchToken，studentId/classId/assignmentId/courseId/coursewareId 必须来自底座校验结果，不能相信前端传入身份。
14. 不要使用外部 CDN、Google Fonts、unpkg、jsdelivr 或远程图片/模型；所有资源必须随 ZIP 本地交付。
15. manifest.json 中 nodePort 默认填 null，让底座自动分配。
16. 最终交付 ZIP 给管理员后台上传。

请生成：
- 课件源码
- manifest.json
- README.md
- 打包说明
- 本地测试说明
- 外部依赖本地化说明
- 如果是画作、录音、视频或复杂过程数据课件，请生成附件上传逻辑、summary 展示数据、必要的 server/ 保存接口，以及可选自定义作品详情页/投屏页
- 交付前自检清单
```

## 18. 常见问题

### 为什么旧 ZIP 可能不能正常运行？

常见原因是旧代码写死了线上 API、固定端口或固定路径。现在必须读取 `platformApiBase` 和 `returnUrl`。

### 为什么直接打开课件没有成绩？

直接打开没有 `launchToken`，底座不知道当前学生、班级和任务。必须从学生后台进入。

### 为什么有些课件看得到但进不去？

老师还没有开放这个课件，或者整堂课未开始 / 已结束。

### 为什么教师看不到作品？

课件只上报了成绩，没有上传附件，也没有在 `summary` 里提供适合默认投屏页展示的 `displayTitle`、`brief`、`scoreText`、`resultItems` 或 `artifacts`。

### “你猜我画”旧版要改什么？

至少检查：

- 是否读取 `platformApiBase`。
- 是否没有阻挡底座默认返回按钮；如自己做返回按钮，是否读取 `returnUrl`。
- 是否有最终提交按钮。
- 是否保存最终作品图片。
- 是否上报 `COMPLETED` 和分数。
- 是否上传作品附件到底座。
- 是否提供足够的 `summary` 展示数据，让底座默认投屏页可用。
- 如果需要自定义舞台效果，是否提供 `projectorUrl` 或 `screenUrl`。
- 是否没有写死线上 API 和固定端口。

如果不满足，需要改源码后重新打包上传。

## 19. 平台维护者参考文档

内部课件开发者不需要同时阅读下面这些文档。它们只用于平台维护、历史追溯或特殊兼容场景：

- `docs/10-courseware-development-standard.md`：平台维护者参考的课件底层规范。
- `docs/13-internal-courseware-developer-handoff.md`：历史内部交接说明。
- `docs/09-course-runtime-deployment.md`：课程运行区部署说明。
- `docs/12-platform-user-manual.md`：平台运营、老师、学生使用手册。
- `docs/08-third-party-course-integration-whitepaper.md`：旧第三方独立站 / SSO 接入兼容文档。
