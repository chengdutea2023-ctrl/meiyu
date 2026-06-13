# 智美教育新生态业务底座内部课件开发交接文档

版本：2026-06-04 v3  
适用对象：内部课件开发者、使用 Codex 开发课件的团队成员  
线上入口：<http://data.docpine.online>、<http://student.docpine.online>、<http://teacher.docpine.online>、<http://agent.docpine.online>

> 如果 GitHub 仓库是私有仓库，异地开发者需要先被邀请为仓库协作者，或者由项目负责人把本文档和示例课件单独发给他。本文档不包含服务器密码、数据库密码、管理员密码或任何服务端密钥。

## 1. 你要开发的是什么

你开发的是“课件”，不是独立用户系统，也不是第三方登录系统。

当前业务底座采用两层结构：

| 层级 | 含义 | 示例 |
| --- | --- | --- |
| 课程 | 教学主题容器，老师布置给班级的是整门课程 | AI 生态探险课 |
| 课件 | 课程下面的具体互动程序，学生进入课程后选择课件学习 | 拯救小岛生态 |

课件运行地址统一为：

```text
http://agent.docpine.online/{课程访问短名}/{课件访问短名}/
```

示例：

```text
课程：AI 生态探险课
课程访问短名：eco-island-rescue
课件：拯救小岛生态
课件访问短名：island-demo
运行地址：http://agent.docpine.online/eco-island-rescue/island-demo/
```

## 2. 底座和课件的职责边界

底座负责：

- 学生注册、教师注册、教师审核。
- 学校、班级、老师、学生的管理。
- 创建课程，给课程选择课件。
- 给班级布置课程，并指定负责老师。
- 生成学生进入课件时的 `launchToken`。
- 保存统一学习记录、成绩、耗时、完成状态和摘要。

课件负责：

- 具体教学互动。
- 前端页面、练习逻辑、游戏逻辑、AI 对话或作品创作。
- 如有需要，保存自己的详细业务数据，例如画作、录音、对话、投屏数据。
- 使用 `launchToken` 获取学生、班级、任务、课程和课件上下文。
- 向底座上报学习进度、成绩、耗时和摘要。

课件不能做：

- 不能自己注册底座学生或教师。
- 不能保存底座账号密码。
- 不能在课件中保留自己的登录、注册、找回密码、重置密码 UI，即使这些 UI 默认隐藏也不允许。
- 不能访问底座数据库。
- 不能假造学生身份。
- 不能把服务器密码、数据库密码、管理员密码或服务端密钥写进代码。

## 3. 推荐开发方式

### 3.1 静态前端课件

适合：

- 展示型互动。
- 简单练习。
- 前端可以直接计算成绩。
- 不需要长期保存复杂作品数据。

目录结构：

```text
your-courseware/
  manifest.json
  static/
    index.html
    assets/
```

### 3.2 Node 服务课件

适合：

- 学生画作。
- 录音或视频。
- AI 对话过程。
- 投屏页面。
- 教师查看作品详情。
- 复杂练习记录或课件自己的后台。

如果课件需要保存学生作品、画作、录音、绘画过程、AI 对话过程、投屏页面或教师作品点评页，不能按纯静态课件交付，必须使用 `NODE` 或 `BOTH`。通常推荐 `BOTH`：好看的互动前端放在 `static/`，保存数据和投屏页面放在 `server/`。

目录结构：

```text
your-courseware/
  manifest.json
  static/
  server/
    package.json
    server.js
```

Node 服务只监听本机地址：

```text
127.0.0.1:{nodePort}
```

学生不会直接访问这个端口。学生访问的是：

```text
http://agent.docpine.online/{课程访问短名}/{课件访问短名}/
```

端口只是服务器内部用来区分不同 Node 课件服务的。静态课件不需要填写端口；Node/BOTH 课件默认也建议把 `nodePort` 填 `null`，让业务底座自动分配端口，避免多个课件都写死 `4102` 造成冲突。只有平台负责人明确分配了端口时，才手动填写端口。

### 3.3 什么时候必须使用 BOTH

下面这些需求不能只靠静态前端解决：

- 保存学生最终作品，例如图片、作文、画布截图。
- 保存过程数据，例如笔画轨迹、步骤选择、AI 对话消息、模型识别历史。
- 保存录音、视频或较大的二进制文件。
- 给教师提供作品详情页。
- 给课堂提供投屏展示页。
- 后续需要按作品做点评、筛选、导出或复盘。

这类课件推荐结构：

```text
your-courseware/
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

职责分工：

| 部分 | 职责 |
| --- | --- |
| `static/` | 学生看到的互动页面，例如画画、录音、答题、拖拽、游戏 |
| `server/` | 保存作品、录音、过程数据，生成作品详情页和投屏页 |
| 业务底座 | 保存学习状态、成绩、耗时、作品入口和摘要 |

注意：底座不是通用文件仓库。原始画作、录音和复杂过程数据应保存在课件自己的 Node 服务、课件数据库、对象存储或平台分配的持久目录中；底座只保存可追溯的链接和摘要。

### 3.4 外部依赖硬性规则

课件最终运行在国内服务器和国内网络环境中。正式交付 ZIP 时，**不允许依赖外部 CDN 或境外资源**。

不允许：

```html
<script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js"></script>
<script src="https://unpkg.com/..."></script>
<link href="https://fonts.googleapis.com/..." rel="stylesheet" />
<img src="https://example-cdn.com/image.png" />
```

允许：

```html
<script src="./vendor/tf.min.js"></script>
<link href="./assets/app.css" rel="stylesheet" />
<img src="./assets/cover.png" />
```

要求：

- 前端脚本、CSS、图片、音频、字体、模型文件都必须放在 ZIP 内。
- AI/机器学习模型必须放在 `static/models/` 或 `static/assets/models/`。
- 第三方前端库必须放在 `static/vendor/`。
- 正式页面不能因为断开外网、CDN 失败、VPN 关闭而白屏。
- 浏览器控制台不能出现外部脚本加载失败导致的核心功能异常。
- 除底座接口 `http://data.docpine.online/api/v1` 和课件运行域名 `http://agent.docpine.online` 外，不应主动请求其他远程服务。

例如使用 TensorFlow.js 的静态课件，应这样交付：

```text
your-courseware/
  manifest.json
  static/
    index.html
    vendor/
      tf.min.js
    models/
      doodlenet/
        model.json
        group1-shard1of1.bin
        class_names.txt
```

`index.html` 中引用：

```html
<script src="./vendor/tf.min.js"></script>
```

### 3.4 账号界面硬性规则

课件不是用户系统，所以课件界面中不应该出现：

- 账户登录。
- 注册账户。
- 找回密码。
- 重置密码。
- 邮箱 + 密码表单。
- 长期 token 管理。
- “登录后保存长期成绩”这类文案。

正确做法：

- 没有 `launchToken` 时，提示“请从学生后台进入课件”。
- 可以提供一个“返回学生后台”按钮，跳转到 `http://student.docpine.online`。
- 历史记录统一在学生后台和教师后台查看；课件只负责展示本次学习过程。

示例：

```html
<p id="identityHint">请从学生后台进入课件。</p>
<a href="http://student.docpine.online">返回学生后台</a>
```

不合格示例：

```html
<button>登录</button>
<button>注册</button>
<button>找回密码</button>
<input type="password" />
```

## 4. manifest.json 规范

每个课件 ZIP 根目录必须包含 `manifest.json`。

静态课件示例：

```json
{
  "slug": "island-demo",
  "title": "拯救小岛生态",
  "runtimeType": "STATIC",
  "entry": "/",
  "nodePort": null,
  "permissions": {
    "needsStudentIdentity": true,
    "storesArtifacts": false,
    "supportsProjector": false
  }
}
```

Node 课件示例：

```json
{
  "slug": "island-demo",
  "title": "拯救小岛生态",
  "runtimeType": "NODE",
  "entry": "/",
  "nodePort": null,
  "permissions": {
    "needsStudentIdentity": true,
    "storesArtifacts": true,
    "supportsProjector": true
  }
}
```

BOTH 课件示例，适合画作、录音、投屏和复杂过程数据：

```json
{
  "slug": "island-demo",
  "title": "拯救小岛生态",
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
| `slug` | 是 | 课件访问短名，必须和后台登记的课件访问短名一致 |
| `title` | 是 | 课件名称 |
| `runtimeType` | 是 | `STATIC`、`NODE`、`BOTH` |
| `entry` | 是 | 一般填写 `/` |
| `nodePort` | Node/BOTH 课件建议留空 | 默认填 `null`，由底座自动分配；只有平台负责人指定端口时才手动填写 |
| `permissions.needsStudentIdentity` | 建议 | 是否需要学生身份 |
| `permissions.storesArtifacts` | 建议 | 是否保存作品、录音、对话等数据 |
| `permissions.supportsProjector` | 建议 | 是否支持教师投屏或作品展示 |

## 5. 学生身份获取流程

课件不能直接判断“当前学生是谁”。标准流程是：

```text
学生登录 student.docpine.online
  -> 查看我的任务
  -> 进入课程
  -> 选择某个课件
  -> 底座生成 launchToken
  -> 跳转到 agent.docpine.online/{课程访问短名}/{课件访问短名}/?launchToken=xxx&platformApiBase=xxx&returnUrl=xxx
  -> 课件校验 launchToken
  -> 课件获得学生、班级、任务、课程、课件上下文
```

课件前端或服务端读取 URL 参数：

```js
const searchParams = new URLSearchParams(location.search);
const launchToken = searchParams.get('launchToken');
const platformApiBase = searchParams.get('platformApiBase') || 'http://data.docpine.online/api/v1';
const returnUrl = searchParams.get('returnUrl') || 'http://student.docpine.online';

function backToStudentPortal() {
  window.location.href = returnUrl;
}
```

然后调用底座校验接口。

课件 UI 必须提供一个明显的“返回学生后台”或“返回我的课程”按钮，按钮点击时跳转到 `returnUrl`。不要在课件里写死返回地址；本地、测试和线上环境都由底座自动传入。

## 6. 校验 launchToken

接口：

```http
POST http://data.docpine.online/api/v1/course-runtime/launch/verify
Content-Type: application/json

{
  "launchToken": "launch-token"
}
```

返回中会包含：

```json
{
  "context": {
    "student": {
      "id": "student-id",
      "email": "student@example.com",
      "displayName": "张同学",
      "ageBand": "6-12岁"
    },
    "course": {
      "id": "course-id",
      "slug": "eco-island-rescue",
      "title": "AI 生态探险课"
    },
    "courseware": {
      "id": "courseware-id",
      "slug": "island-demo",
      "title": "拯救小岛生态"
    },
    "assignment": {
      "id": "assignment-id",
      "title": "生态探险学习任务"
    },
    "class": {
      "id": "class-id",
      "name": "一年级 1 班",
      "organization": {
        "id": "school-id",
        "name": "天府七中"
      }
    }
  },
  "reportEndpoint": "/api/v1/course-runtime/launch/records"
}
```

课件保存数据时，优先使用这些 ID：

```text
student.id
course.id
course.slug
courseware.id
courseware.slug
assignment.id
class.id
```

## 7. 上报学习记录和成绩

课件完成学习、阶段保存或提交作品时，调用：

```http
POST http://data.docpine.online/api/v1/course-runtime/launch/records
Content-Type: application/json

{
  "launchToken": "launch-token",
  "status": "COMPLETED",
  "score": 92,
  "durationSeconds": 480,
  "summary": {
    "comment": "完成拯救小岛生态任务",
    "artifactUrl": "http://agent.docpine.online/eco-island-rescue/island-demo/work/abc123",
    "projectorUrl": "http://agent.docpine.online/eco-island-rescue/island-demo/projector/abc123"
  }
}
```

`status` 可选：

```text
STARTED
PROGRESS
COMPLETED
```

说明：

- 学生点击课件时，底座会自动记录一次 `STARTED`。
- 课件中途保存可以上报 `PROGRESS`。
- 学生点击“提交”“完成”“保存成绩”时，上报 `COMPLETED`。
- `score` 建议为 0-100。
- `durationSeconds` 是本次学习耗时，单位秒。
- `summary` 用于保存作品入口、投屏入口、简短评价和关键结果。

## 8. 作品、录音、投屏和复杂过程数据规范

如果课件需要保存学生作品、画作、录音、投屏页面或复杂过程数据，请按本节开发。不要只把数据临时放在浏览器内存、localStorage 或纯静态页面里。

### 8.1 数据保存边界

| 数据 | 保存位置 |
| --- | --- |
| 学习状态、成绩、耗时、完成时间 | 业务底座学习记录 |
| 作品入口、投屏入口、简短评价、关键结果 | 业务底座 `summary` |
| 画作图片、录音文件、笔画轨迹、AI 对话、模型识别历史 | 课件 Node 服务自己的存储 |
| 教师作品详情页、投屏页 | 课件 Node 服务 |

底座只负责统一记录和追溯入口，不负责替课件保存所有原始作品文件。课件服务要保存自己的详细业务数据。

### 8.2 Node 服务至少提供的接口

画作、录音或复杂过程课件建议至少实现：

| 接口 | 用途 |
| --- | --- |
| `POST /api/works` | 保存学生作品，例如画布图片、笔画轨迹、识别结果 |
| `POST /api/recordings` | 保存录音文件或录音元数据 |
| `POST /api/progress` | 保存阶段进度，并可向底座上报 `PROGRESS` |
| `POST /api/submit` | 学生最终提交，保存作品并向底座上报 `COMPLETED` |
| `GET /work/:workId` | 教师查看单个作品详情 |
| `GET /projector/:workId` | 教师投屏展示页面 |

所有写入接口必须校验 `launchToken`，不能相信前端直接传来的 `studentId`。学生身份、班级、任务、课程和课件必须来自 `/course-runtime/launch/verify` 的返回。

画作类课件必须同时保存两类数据：

- 可直接打开或下载的作品图片，例如 PNG/WebP/JPEG 文件。
- 可复盘创作过程的过程数据，例如笔画轨迹、步骤选择、模型识别历史。

只保存笔画轨迹、只保存分数、只靠前端重新绘制，都不算完整作品留档。正式教学档案至少要能打开一张学生最终作品图片。

### 8.3 作品数据示例

画作类课件建议至少保存：

```json
{
  "workId": "work_abc123",
  "studentId": "student-id",
  "classId": "class-id",
  "assignmentId": "assignment-id",
  "courseId": "course-id",
  "coursewareId": "courseware-id",
  "imageUrl": "/work/work_abc123/image.png",
  "imageMimeType": "image/png",
  "imageSizeBytes": 123456,
  "strokeData": [],
  "predictionHistory": [],
  "score": 92,
  "durationSeconds": 480,
  "createdAt": "2026-06-04T12:00:00.000Z"
}
```

录音类课件建议至少保存：

```json
{
  "recordingId": "rec_abc123",
  "studentId": "student-id",
  "classId": "class-id",
  "assignmentId": "assignment-id",
  "audioUrl": "/recordings/rec_abc123.webm",
  "transcript": "学生朗读文本",
  "score": 88,
  "durationSeconds": 60,
  "createdAt": "2026-06-04T12:00:00.000Z"
}
```

### 8.4 最终提交流程

推荐流程：

```text
学生点击提交
  -> 前端把作品图片、过程数据、耗时和 launchToken 发给课件 Node 服务
  -> Node 服务调用底座 launch/verify 校验 launchToken
  -> Node 服务保存作品图片和过程数据
  -> Node 服务生成 artifactUrl 和 projectorUrl
  -> Node 服务调用底座 launch/records 上报 COMPLETED
  -> 前端显示提交成功
```

上报底座时，`summary` 应包含可追溯入口：

```json
{
  "launchToken": "launch-token",
  "status": "COMPLETED",
  "score": 92,
  "durationSeconds": 480,
  "summary": {
    "workId": "work_abc123",
    "artifactUrl": "http://agent.docpine.online/eco-island-rescue/island-demo/work/work_abc123",
    "projectorUrl": "http://agent.docpine.online/eco-island-rescue/island-demo/projector/work_abc123",
    "imageUrl": "http://agent.docpine.online/eco-island-rescue/island-demo/work/work_abc123/image.png",
    "brief": "学生完成生态小岛画作，模型识别正确率 92%",
    "savedArtifacts": ["drawingImage", "strokeData", "predictionHistory"]
  }
}
```

### 8.5 持久化要求

- 不要把唯一作品数据只保存在浏览器 localStorage。
- 不要把唯一作品数据只写进 `static/` 目录。
- 不要把唯一作品数据只写进可能被重新上传 ZIP 覆盖的源码目录。
- 画作类课件不要只保存可重绘的笔画数据，必须保存最终图片文件或等价的可下载图片资源。
- 正式长期保存时，应使用课件自己的数据库、对象存储，或平台分配的持久数据目录。
- 如果暂时用 `server/data/` 做本地测试，必须在 README 中说明：这是测试存储，不是正式长期存储方案。

## 9. 静态课件最小示例

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>拯救小岛生态</title>
  </head>
  <body>
    <h1>拯救小岛生态</h1>
    <button id="submit">提交成绩</button>
    <pre id="output"></pre>

    <script>
      const apiBase = 'http://data.docpine.online/api/v1';
      const launchToken = new URLSearchParams(location.search).get('launchToken');
      const output = document.querySelector('#output');

      async function verifyLaunch() {
        if (!launchToken) {
          output.textContent = '请从学生后台进入课件。';
          return;
        }

        const response = await fetch(`${apiBase}/course-runtime/launch/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ launchToken }),
        });

        output.textContent = JSON.stringify(await response.json(), null, 2);
      }

      async function submitScore() {
        const response = await fetch(`${apiBase}/course-runtime/launch/records`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            launchToken,
            status: 'COMPLETED',
            score: 92,
            durationSeconds: 480,
            summary: {
              comment: '完成课件学习',
            },
          }),
        });

        output.textContent = JSON.stringify(await response.json(), null, 2);
      }

      document.querySelector('#submit').addEventListener('click', submitScore);
      void verifyLaunch();
    </script>
  </body>
</html>
```

## 10. ZIP 交付结构

交付给管理员的是一个 ZIP 包，ZIP 根目录建议就是课件目录内容。

正确结构：

```text
island-demo.zip
  manifest.json
  static/
    index.html
    assets/
```

Node 课件：

```text
island-demo.zip
  manifest.json
  static/
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
```

不要在生产代码中保留：

```text
https://cdn.jsdelivr.net/
https://unpkg.com/
https://fonts.googleapis.com/
http://127.0.0.1
http://localhost
登录/注册/找回密码表单
```

说明：

- `http://127.0.0.1` 和 `http://localhost` 可以出现在 README 的本地测试说明中，但不能出现在学生会看到的正式页面错误提示或生产跳转逻辑中。
- 如确实需要外部 AI 服务、对象存储或业务服务，必须先和平台负责人确认，不能由课件自行决定。

## 11. 管理员上传和上线流程

内部开发者通常不需要登录服务器，也不需要 root 权限。

交付流程：

1. 开发者按规范完成课件。
2. 开发者打包 ZIP。
3. 管理员进入 <http://data.docpine.online>。
4. 管理员创建课程，例如“AI 生态探险课”。
5. 管理员创建或选择课件，例如“拯救小岛生态”。
6. 管理员上传 ZIP。
7. 系统校验 `manifest.json`。
8. 静态课件校验通过后可以发布。
9. Node 课件校验通过后，管理员点击部署或重启。
10. 管理员把课件加入课程。
11. 管理员在“课程布置”中把课程分配给班级和负责老师。
12. 学生在学生后台进入课程并选择课件学习。
13. 教师在教师后台查看学习记录和成绩。

## 12. 开发者本地验收清单

交付 ZIP 前，请逐项检查：

- 课件有 `manifest.json`。
- `manifest.json.slug` 和后台登记的课件访问短名一致。
- 静态课件有 `static/index.html`。
- Node 课件有 `server/package.json` 和启动入口。
- Node 课件只监听 `127.0.0.1:{nodePort}`。
- Node/BOTH 课件的 `manifest.nodePort` 默认填写 `null`，不写死 `4102` 等固定端口，除非平台负责人明确分配。
- 需要保存画作、录音、投屏或复杂过程数据时，`runtimeType` 使用 `BOTH` 或 `NODE`，不能使用纯 `STATIC`。
- 需要保存作品时，Node 服务有作品保存接口，例如 `/api/works` 或 `/api/submit`。
- 画作类课件必须保存最终作品图片，例如 PNG/WebP/JPEG 文件，不能只保存分数或笔画轨迹。
- 需要投屏时，Node 服务有投屏页面，例如 `/projector/:workId`。
- 作品原始数据没有只保存在浏览器 localStorage 或 `static/` 目录。
- 课件能读取 URL 中的 `launchToken`。
- 课件能调用 `/course-runtime/launch/verify`。
- 课件有“提交”“完成”或“保存成绩”按钮。
- 课件能调用 `/course-runtime/launch/records` 上报 `COMPLETED`。
- 上报 `COMPLETED` 时，`summary` 包含 `artifactUrl`、`projectorUrl` 或足够追溯作品的字段。
- 课件没有外部 CDN 依赖，断开外网后仍能打开核心功能。
- 第三方前端库已经放入 `static/vendor/`。
- 图片、音频、字体、模型文件已经放入 `static/assets/` 或 `static/models/`。
- 课件界面没有登录、注册、找回密码、重置密码、邮箱密码表单。
- 学生未从底座进入时，只提示“请从学生后台进入课件”，不提供课件自己的账号入口。
- 课件没有打包 `node_modules`、`.git`、`.env`。
- 代码里没有服务器密码、数据库密码、管理员密码、服务端密钥。

## 13. 给 Codex 的开发提示词

把下面这段直接发给课件开发者的 Codex：

```text
你现在要为“智美教育新生态业务底座”开发一个内部课件。

请严格按下面规则开发：

1. 这是一个课件，不是独立用户系统。
1. 学生和教师账号都由业务底座管理，课件不做注册和登录。
1. 学生必须从 student.docpine.online 进入课件。
1. 课件启动 URL 会带 launchToken、platformApiBase 和 returnUrl。
1. 课件必须调用 http://data.docpine.online/api/v1/course-runtime/launch/verify 校验 launchToken。
1. 课件必须在完成学习时调用 http://data.docpine.online/api/v1/course-runtime/launch/records 上报成绩。
1. 课件必须包含 manifest.json。
1. 最终交付 ZIP 包给管理员后台上传。
1. 不要写入服务器密码、数据库密码、管理员密码、服务端密钥。
1. 不要使用外部 CDN、Google Fonts、unpkg、jsdelivr 或远程图片/模型。
1. 所有前端库、图片、音频、字体、模型文件必须随 ZIP 本地交付。
1. 课件界面不能出现登录、注册、找回密码、重置密码、邮箱密码表单。
1. 课件必须读取 returnUrl，并在 UI 中提供“返回学生后台”或“返回我的课程”按钮。
1. 没有 launchToken 时，只提示“请从学生后台进入课件”，可以使用 returnUrl 返回学生后台。
1. 代码中不要把 localhost 或 127.0.0.1 写入正式页面跳转或正式错误提示。
1. 如果课件需要保存学生作品、画作、录音、投屏页面或复杂过程数据，请使用 runtimeType=BOTH，不要做成纯静态课件。
1. BOTH 课件中，static/ 负责学生互动页面，server/ 负责保存作品、录音、过程数据、作品详情页和投屏页。
1. Node 服务的写入接口必须校验 launchToken，studentId/classId/assignmentId/courseId/coursewareId 必须来自底座校验结果，不能相信前端传来的学生身份。
1. 作品原始数据保存在课件自己的服务端存储中；底座只保存成绩、耗时、状态、作品入口和摘要。
1. 至少实现最终提交按钮：点击后保存作品，生成 artifactUrl/projectorUrl，并调用底座 records 接口上报 COMPLETED。
1. manifest.json 中 nodePort 默认填 null，让底座自动分配端口；不要写死 4102，除非平台负责人明确指定。
1. 画作类课件必须把最终画布保存为 PNG/WebP/JPEG 等图片文件，同时可以保存 strokeData、predictionHistory 等过程数据。
1. 上报底座 summary 时，建议包含 workId、artifactUrl、projectorUrl、imageUrl、brief、savedArtifacts。

请生成：
- 课件源码
- manifest.json
- README.md
- 打包说明
- 本地测试说明
- 外部依赖本地化说明
- 如果是保存作品/录音/投屏的课件，请生成 server/、作品保存接口、作品详情页、投屏页和数据存储说明
- 如果是画作类课件，请说明如何保存最终作品图片，以及图片访问 URL 如何生成
- 交付前自检清单
- 如果是 Node/BOTH 课件，请说明启动命令，并保持 nodePort 默认为 null

底座接口：

POST http://data.docpine.online/api/v1/course-runtime/launch/verify
body: { "launchToken": "..." }

POST http://data.docpine.online/api/v1/course-runtime/launch/records
body:
{
  "launchToken": "...",
  "status": "COMPLETED",
  "score": 92,
  "durationSeconds": 480,
  "summary": {
    "workId": "work_abc123",
    "artifactUrl": "http://agent.docpine.online/课程短名/课件短名/work/work_abc123",
    "projectorUrl": "http://agent.docpine.online/课程短名/课件短名/projector/work_abc123",
    "imageUrl": "http://agent.docpine.online/课程短名/课件短名/work/work_abc123/image.png",
    "comment": "完成课件学习"
  }
}
```

## 14. 常见问题

### 14.1 课件为什么不能自己登录学生？

因为学生身份必须由业务底座统一维护。课件只通过 `launchToken` 获取当前学生上下文。

### 14.2 课件为什么要上报成绩？

教师后台和学生后台都依赖底座学习记录。如果课件不上报，老师看不到学生是否完成、成绩多少、耗时多久。

### 14.3 静态课件和 Node 课件怎么选？

能用静态课件解决，就优先用静态课件。需要保存作品、录音、AI 对话、投屏或复杂后台时，再用 `NODE` 或 `BOTH`。如果课件既有学生互动前端，又需要保存作品和投屏，优先用 `BOTH`。

### 14.4 为什么之前纯静态 demo 不够用？

纯静态 demo 可以展示互动，也可以向底座上报一个成绩摘要，但它不能可靠保存学生原始作品、录音、绘画过程和投屏页面。浏览器本地存储不适合做正式教学档案；学生换设备、清缓存或重新上传课件后，数据都可能丢失。需要长期留档时，必须增加 Node 服务保存详细数据。

### 14.5 课件访问短名是什么？

课件访问短名就是 URL 中的英文短名，例如 `island-demo`。它用于生成课件地址，必须稳定、简短、只用小写字母、数字和连字符。

### 14.6 课件入口为什么可以留空？

后台可以根据课程访问短名和课件访问短名自动生成入口。一般不要手写入口，避免地址写错。

### 14.7 为什么 Node 课件需要端口？

端口用于服务器内部启动 Node 服务。学生不直接访问端口，学生只访问 `agent.docpine.online` 统一地址。

### 14.8 为什么不要写死 4102 端口？

多个 Node/BOTH 课件如果都写死 `4102`，线上部署时会端口冲突，导致后部署的课件启动失败。`manifest.nodePort` 默认填 `null`，由业务底座自动分配端口；只有平台负责人明确分配端口时才手动填写。

### 14.9 为什么画作课件必须保存最终图片？

笔画轨迹可以用于复盘过程，但它不是直观作品文件。教师查看、课堂投屏、后续归档、家长展示时，通常需要能直接打开的一张最终作品图。因此画作类课件必须保存 PNG/WebP/JPEG 等图片文件，同时可以保存 `strokeData`、`predictionHistory` 等过程数据。

### 14.10 为什么不能使用 CDN？

因为整套系统主要在中国国内使用。CDN、Google Fonts、远程模型和远程图片在正式环境中可能加载失败，导致课件白屏、模型不可用或样式错乱。课件交付 ZIP 必须自包含，管理员上传后不依赖外网资源也能运行核心功能。

### 14.11 如果课件需要 TensorFlow.js、Three.js、图表库怎么办？

把库文件下载到课件目录，例如：

```text
static/vendor/tf.min.js
static/vendor/three.min.js
static/vendor/chart.umd.min.js
```

然后在页面中使用相对路径引用：

```html
<script src="./vendor/tf.min.js"></script>
```

### 14.12 为什么不能保留登录注册弹窗？

因为学生身份由底座统一管理。即使弹窗默认隐藏，也会让后续维护者、老师或学生误以为课件有自己的账号体系。课件只接受 `launchToken`，没有 `launchToken` 时引导学生回到学生后台。

## 15. 相关项目文档

在同一个仓库里还可以参考：

- `docs/12-platform-user-manual.md`：业务底座完整使用手册。
- `docs/10-courseware-development-standard.md`：课件开发规范。
- `docs/09-course-runtime-deployment.md`：课程运行区部署说明。
- `docs/course-runtime/examples/can-machines-learn/`：最小示例课件。
