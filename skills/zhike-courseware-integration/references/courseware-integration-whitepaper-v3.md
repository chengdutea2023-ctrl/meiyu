# 智课课件插件接入技术白皮书

版本：v3.0
更新日期：2026-09-08
适用对象：学校或合作单位的课件研发人员、第三方开发团队、使用 AI 编程 Agent 的开发者
适用范围：接入智课平台的互动课件设计、开发、联调、打包和验收

本文档是课件插件交付的主要技术依据。它描述的是智课平台的正式接入合同，不是普通独立网页的开发说明。开发者可使用 Codex、Cursor、Trae、Claude Code 或其他能够读取本地工程文件并执行命令的编程 Agent。若使用 DeepSeek、豆包等普通聊天 App，需要把本白皮书、课件源码和需求文件主动上传给模型；聊天 App 不能自动读取开发者电脑上的目录。

## 1. 核心边界

```text
智课平台负责：账号、学校、班级、课程、排课、开放权限、学习记录和成果展示。
课件插件负责：具体教学互动、过程反馈、成绩计算、作品生成和结果上报。
```

课件插件不得：

- 自建登录、注册、找回密码或账号授权流程。
- 保存平台账号、密码、数据库连接或服务器密钥。
- 直接连接平台数据库，或自行判断学生属于哪个班级。
- 绕过教师对课程和课件的开放状态。
- 把 `launchToken`、学生隐私或第三方密钥写入日志。
- 把调试 JSON、异常堆栈、源代码或模型原始响应直接显示给学生。

课件插件必须：

- 从学生后台正式启动，并读取平台传入的启动参数。
- 校验启动凭证，使用平台返回的身份与任务上下文。
- 在完成学习后可靠上报成绩、耗时、摘要和必要作品附件。
- 支持失败重试、重复点击保护、平板适配和明确的错误提示。
- 交付可复现、无秘密、无外部运行依赖的标准 ZIP。

## 2. 正式入口与运行地址

```text
管理员后台：https://data.docpine.online
教师后台：https://teacher.docpine.online
学生后台：https://student.docpine.online
课件运行基址：https://agent.docpine.online
```

课件正式地址形态：

```text
https://agent.docpine.online/{courseSlug}/{coursewareSlug}/
```

`agent.docpine.online` 是课件运行基址，不是独立首页。直接打开根路径可能返回 `404`，这不代表具体课件故障。正式验收应从学生后台启动课件，不能只测试运行基址首页。

禁止在课件代码中写死上述域名、`localhost`、服务器 IP 或固定 Node 端口。平台启动课件时会在 URL 中传入当前环境所需地址。

## 3. 课程、课件与独立演示页

| 对象 | 作用 | 是否属于正式平台记录 |
| --- | --- | --- |
| 课程 Course | 教学主题和排课容器 | 是 |
| 课件 Courseware | 课程中的一个互动学习单元 | 是 |
| 独立演示页 | 用于设计预览或宣传的单页原型 | 否，除非完成正式接入 |

例如 `coursestudy.docpine.online` 下的独立网页，只能视为设计原型或宣传演示。只有完成 `manifest.json`、启动校验、成绩上报、附件保存和平台打包验收后，才能称为智课课件插件。

## 4. 运行类型

### 4.1 STATIC

适合选择、判断、拖拽、排序、轻量游戏等完全由浏览器执行的课件。

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

### 4.2 NODE

适合需要课件自有服务端 API、服务端渲染或服务端作品页的课件。

```text
courseware.zip
  manifest.json
  server/
    package.json
    server.js
```

### 4.3 BOTH

适合绘画、录音、视频、AI 对话、生成式 AI、多阶段识别和自定义投屏等复杂课件。

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

Node 服务必须读取平台分配的 `PORT`，不得绑定固定端口。静态资源与 API 路径必须兼容平台的课件子路径，不能假定应用运行在域名根目录。

## 5. manifest.json

标准示例：

```json
{
  "slug": "guess-my-drawing",
  "title": "你猜我画",
  "runtimeType": "BOTH",
  "entry": "/",
  "nodePort": null
}
```

| 字段 | 要求 |
| --- | --- |
| `slug` | 英文小写短名，正式值由项目负责人或平台清单确定 |
| `title` | 课件正式中文名称 |
| `runtimeType` | 只能是 `STATIC`、`NODE`、`BOTH` |
| `entry` | 必须以 `/` 开头，通常为 `/` |
| `nodePort` | 通常为 `null`，由平台分配 |

不要增加未经平台实现的 `permissions` 字段并把它当成权限控制。平台当前只校验上表字段；摄像头、麦克风、附件和投屏能力应在需求、实现和验收清单中声明。

在智课主仓库内开发时，`manifest.json` 的 `slug`、`title`、`runtimeType` 必须与 `coursewares/catalog.json` 完全一致。外部团队开发新课件时，应先向项目负责人领取最终名称和 slug，再开始打包。

## 6. 标准启动流程

```text
学生登录学生后台
  -> 教师已开始课程并开放该课件
  -> 学生点击课件
  -> 平台生成短期 launchToken
  -> 平台跳转到课件并传入 launchToken、platformApiBase、returnUrl
  -> 课件调用 verify 校验上下文
  -> 课件上报 STARTED 并开始互动
  -> 课件按需上报 PROGRESS
  -> 课件上传最终作品附件
  -> 课件上报 COMPLETED
  -> 保存成功后允许返回学生后台
```

启动参数：

| 参数 | 说明 |
| --- | --- |
| `launchToken` | 当前学生本次课件启动凭证，默认有效期由平台配置，当前默认 8 小时 |
| `platformApiBase` | 当前环境 API 基址，正式环境通常含 `/api/v1` |
| `returnUrl` | 返回学生后台或课程页的地址 |

平台会在每次校验、上传和成绩上报时再次检查启动凭证、学生班级、课程状态和课件开放状态。课件不能缓存一次校验结果后绕过后续平台检查。

## 7. 推荐前端接入代码

### 7.1 读取上下文与统一请求

```js
const params = new URLSearchParams(window.location.search);
const launchToken = params.get('launchToken');
const platformApiBase = (params.get('platformApiBase') || '').replace(/\/$/, '');
const returnUrl = params.get('returnUrl');
const demoMode = params.get('demo') === '1';

function requireLaunchContext() {
  if (demoMode) return;
  if (!launchToken || !platformApiBase) {
    throw new Error('请从学生后台进入课件');
  }
}

async function platformPost(path, body, timeoutMs = 15000) {
  requireLaunchContext();
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${platformApiBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || `平台请求失败 (${response.status})`);
    }
    return data;
  } finally {
    window.clearTimeout(timer);
  }
}
```

正式模式初始化：

```js
async function initializeCourseware() {
  if (demoMode) {
    showDemoBanner('本地预览，成绩不会保存');
    return;
  }

  const launch = await platformPost('/course-runtime/launch/verify', {
    launchToken,
  });

  await platformPost('/course-runtime/launch/records', {
    launchToken,
    status: 'STARTED',
  });

  renderWithLaunchContext(launch.context);
}
```

本地预览可使用 `?demo=1`，但必须明显标注“本地预览，成绩不会保存”。演示模式不得伪造生产 `launchToken`，不得请求生产 API。

### 7.2 成绩与数值安全

成绩必须是 `0` 至 `100` 之间的有限数字，耗时必须是非负整数。

```js
function normalizeScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) {
    throw new Error('成绩计算异常，请重试');
  }
  return Math.max(0, Math.min(100, score));
}

function normalizeDuration(value) {
  const duration = Number(value);
  if (!Number.isFinite(duration)) return 0;
  return Math.max(0, Math.floor(duration));
}
```

“重试”必须重新初始化分数、题目索引、计时器、已选内容、完成状态和保存状态。任何界面都不得显示 `NaN`、`undefined` 或 `[object Object]`。

### 7.3 上传附件

接口：

```text
POST {platformApiBase}/course-runtime/launch/artifacts
```

请求示例：

```js
const artifact = await platformPost('/course-runtime/launch/artifacts', {
  launchToken,
  fileName: 'final-work.png',
  mimeType: 'image/png',
  kind: 'final-work',
  contentBase64,
  metadata: {
    scene: 'final-submit',
    title: '最终作品',
  },
}, 60000);
```

平台当前默认单个附件解码后不超过 50 MB，实际限制以生产配置为准。支持图片、音频、视频、PDF、JSON、二进制文件、TXT 和 VTT。浏览器上传前应压缩超大图片，录音和视频应控制时长与码率。

### 7.4 完成、保存与返回

成绩保存不能依赖某一个“返回”按钮。学生达到完成条件时，应先执行最终保存；只有 `COMPLETED` 请求成功后，结果页才能显示“已保存”。平台自动注入的浮动返回按钮只是导航入口，不负责替课件保存成绩。

推荐使用单一完成函数：

```js
let saveState = 'idle';
let uploadedArtifacts = [];

async function completeCourseware(result) {
  if (saveState === 'saving' || saveState === 'saved') return;
  saveState = 'saving';
  setSubmitDisabled(true);
  showSaveStatus('正在保存成绩...');

  try {
    const score = normalizeScore(result.score);
    const durationSeconds = normalizeDuration(result.durationSeconds);

    for (const item of result.pendingArtifacts) {
      if (uploadedArtifacts.some((saved) => saved.localId === item.localId)) continue;
      const saved = await platformPost('/course-runtime/launch/artifacts', {
        launchToken,
        fileName: item.fileName,
        mimeType: item.mimeType,
        kind: item.kind,
        contentBase64: item.contentBase64,
        metadata: item.metadata || {},
      }, 60000);
      uploadedArtifacts.push({ localId: item.localId, ...saved });
    }

    await platformPost('/course-runtime/launch/records', {
      launchToken,
      status: 'COMPLETED',
      score,
      durationSeconds,
      summary: {
        displayTitle: result.displayTitle,
        brief: result.brief,
        scoreText: `${Math.round(score)} 分`,
        resultItems: result.resultItems,
        processSummary: result.processSummary,
        artifacts: uploadedArtifacts.map((item) => ({
          kind: item.kind,
          title: item.originalFileName || item.fileName || '作品',
          url: item.url,
          mimeType: item.mimeType,
        })),
      },
    });

    saveState = 'saved';
    showSaveStatus('成绩已保存');
    showReturnButton();
  } catch (error) {
    saveState = 'failed';
    setSubmitDisabled(false);
    showSaveError(error.message || '保存失败，请检查网络后重试');
  }
}

function returnToStudentPortal() {
  if (saveState !== 'saved' && !window.confirm('成绩尚未保存，确定离开吗？')) return;
  if (returnUrl) window.location.assign(returnUrl);
  else window.history.back();
}
```

硬性要求：

- 保存中禁用重复提交，避免重复附件和并发请求。
- 任一必需附件上传失败时，不得上报 `COMPLETED`。
- 重试只补传失败项，已经成功的附件保留在当前会话中。
- `COMPLETED` 失败时留在结果页，显示可理解的错误和“重试保存”。
- 不得先跳转再异步保存，也不得使用未等待完成的 `fetch`。
- 不能仅在 `beforeunload`、`sendBeacon` 或浏览器关闭事件里保存最终成绩。

## 8. 学习记录与 summary

记录接口：

```text
POST {platformApiBase}/course-runtime/launch/records
```

状态：

- `STARTED`：课件已进入。
- `PROGRESS`：重要阶段进度，可选。
- `COMPLETED`：最终成绩和作品已经完整保存。

最终请求示例：

```json
{
  "launchToken": "launch-token",
  "status": "COMPLETED",
  "score": 90,
  "durationSeconds": 360,
  "summary": {
    "displayTitle": "算法闯关结果",
    "brief": "完成 5 轮任务，正确 4 轮",
    "scoreText": "90 分",
    "resultItems": [
      { "label": "正确轮数", "value": "4/5" },
      { "label": "完成情况", "value": "已完成" }
    ],
    "processSummary": "学生完成了顺序、条件与循环任务。",
    "artifacts": []
  }
}
```

`summary` 应为可供教师、学生和投屏页直接读取的结构化 JSON。不要塞入完整日志、模型原始响应、Base64 文件或大段 HTML。

## 9. 多结果与生成式 AI

需要生成多张图片、多段音频或多个故事分镜时，必须把任务状态建模为“总任务 + 子任务”：

- 每个子任务有 `pending`、`running`、`succeeded`、`failed` 状态。
- 界面可展示已经成功的结果，但必须明确标注“部分生成完成”，不能伪装为完整结果。
- 任一必需子任务失败时，中止最终提交，不上报 `COMPLETED`。
- 用户重试时只重跑失败项，避免浪费时间和调用费用。
- 全部必需结果成功后，才能进入风格选择、最终确认或成绩保存阶段。
- 进度条必须来自真实子任务状态；不能固定停在 70% 或用无限假进度掩盖失败。

第三方 AI 服务要求：

- API Key 只保存在课件 Node 服务的环境变量中，绝不能进入前端、ZIP 示例、Git 或日志。
- 浏览器只请求课件自己的相对 API，例如 `./api/generate`。
- 服务端必须设置超时、有限次数重试和明确错误分类。
- 日志记录请求 ID、阶段、耗时和错误类别，但不得记录密钥、启动凭证、学生敏感信息或完整生成内容。
- 对可能重复扣费的请求使用任务 ID 或幂等策略。
- 模型不可用时给教师和学生明确提示，并保留已完成结果以便继续。

禁止外链 CDN 指的是课件运行所需的前端脚本、字体、模型和视觉素材不得依赖境外公共 CDN。由课件 Node 服务调用已批准的 AI API 属于服务能力，不等同于前端热链资源，但必须经过项目负责人配置和安全审查。

## 10. 资源、路径与离线要求

正式 ZIP 必须自包含。以下内容应放入课件包：

```text
static/assets/
static/vendor/
static/models/
```

禁止运行时依赖：

```text
cdn.jsdelivr.net
unpkg.com
fonts.googleapis.com
未经批准的远程图片、字体、音频或模型文件
```

所有前端资源使用相对路径，确保在 `/{courseSlug}/{coursewareSlug}/` 子路径下可用。不要在 CSS、HTML、JavaScript 中写以 `/assets` 开头的根路径，除非已确认由当前课件服务处理。

## 11. 摄像头、麦克风与学生隐私

- 只有教学必需时才申请摄像头或麦克风权限。
- 权限申请前用学生能理解的中文说明用途。
- 拒绝权限后提供重试或不使用设备的替代路径，不允许白屏。
- 页面隐藏、离开课件或任务完成后停止媒体轨道。
- 默认不保存原始摄像头画面；确需保存时必须在需求和页面中明确说明。
- 不使用人脸识别确定学生身份，不把生物特征发送给未经批准的第三方。

## 12. UI 与设备适配

目标用户为课堂中的学生，主要操作必须一眼可见。页面至少验证以下视口：

```text
桌面：1440 x 900
iPad 横屏：1024 x 768
iPad 竖屏：768 x 1024
手机：390 x 844
```

验收要求：

- 主要按钮、题目、画布、结果和返回入口无重叠、裁切或超出屏幕。
- iPad Safari 不显示调试代码、JSON、模板字符串或源码片段。
- 长中文、英文单词和错误信息能换行，不撑破容器。
- 固定棋盘、画布、计时器和分数区有稳定尺寸，不因内容变化跳动。
- 触控按钮有足够点击区域，不只依赖 hover。
- 加载、空数据、权限拒绝、网络失败、保存失败和部分生成均有完整状态。
- 每轮题目或素材按教学设计随机轮换；若要求随机，不能永远只出现固定前几项。

## 13. 打包规则

ZIP 根目录必须直接包含 `manifest.json`，不能再套一层无意义文件夹。单个 ZIP 不超过 80 MB。

禁止打包：

```text
node_modules/
.runtime/
.codex-backups/
.git/
.svn/
server/data/
.env 或 .env.*
env.json
*.log
*.pid
.DS_Store
任何 SSH 私钥、账号密码、数据库备份、学生数据或运行日志
```

课件源码不允许符号链接。Node 依赖应在 `package.json` 中声明，由部署流程安装；不要把本机 `node_modules` 放入 ZIP。

在智课主仓库中使用：

```bash
npm run coursewares:validate
npm run coursewares:test
npm run coursewares:package
```

正式发布包应附带：

- 课件标题、slug 和运行类型。
- 源码 Git 提交号；外部交付可使用明确版本号。
- ZIP 文件 SHA-256。
- 测试结果与已知限制。

## 14. 安全要求

- 不把 `.env`、访问密钥、SSH 私钥、数据库、真实账号清单和日志交给第三方模型。
- 不在截图、报错弹窗或前端源代码中暴露 API Key。
- 不接受由 URL 参数传入的 `studentId`、`classId` 作为可信身份。
- 对学生输入、文件名和模型输出进行长度、类型与展示转义校验。
- Node 服务仅开放课件必需接口，不提供任意文件读取、命令执行或目录浏览。
- 记录日志时对 `launchToken`、Authorization 和 Cookie 做删除或脱敏。
- 在 ZIP 交付前执行秘密扫描。

## 15. 完整验收清单

### 15.1 结构

- [ ] ZIP 根目录存在可解析的 `manifest.json`。
- [ ] 名称、slug、运行类型与分配清单一致。
- [ ] STATIC/BOTH 存在 `static/index.html` 或根目录 `index.html`。
- [ ] NODE/BOTH 存在 `server/package.json` 或根目录 `package.json`。
- [ ] ZIP 小于等于 80 MB，不含禁止文件和符号链接。
- [ ] 所有运行资源本地化，没有未批准 CDN 或远程热链。

### 15.2 平台接入

- [ ] 从学生后台能够进入，直接缺少凭证时提示正确。
- [ ] 正确读取 `launchToken`、`platformApiBase`、`returnUrl`。
- [ ] `verify`、`STARTED`、附件上传和 `COMPLETED` 均成功。
- [ ] 关闭课程、关闭课件或凭证到期后能显示可理解错误。
- [ ] 正式模式不写死域名、IP、端口或学生身份。

### 15.3 成绩与作品

- [ ] `score` 始终为 `0-100` 的有限数字，绝不出现 `NaN`。
- [ ] `durationSeconds` 为非负整数。
- [ ] 必需附件全部成功后才上报 `COMPLETED`。
- [ ] 保存失败停留当前页，可重试，不误报“已保存”。
- [ ] 任意完成后的退出入口都不会造成成绩丢失。
- [ ] 教师后台、学生后台和默认投屏能读取摘要与作品。

### 15.4 交互与兼容

- [ ] 重试会彻底重置上一轮状态，并重新生成需要随机的内容。
- [ ] 快速重复点击不会产生并发保存或重复结果。
- [ ] 桌面、iPad 横竖屏和手机视口无裁切、重叠或源码泄漏。
- [ ] 摄像头/麦克风允许、拒绝和中断场景均已测试。
- [ ] AI 请求超时、部分成功、全部失败和补偿重试均已测试。

### 15.5 回归与交付

- [ ] 本地 `?demo=1` 可预览且明确显示不保存成绩。
- [ ] 正式学生入口完成一次端到端测试。
- [ ] 课件打包测试、秘密扫描和 SHA-256 已完成。
- [ ] 未经项目负责人明确授权，不直接发布到生产环境。

## 16. 常见故障定位

| 现象 | 优先检查 |
| --- | --- |
| 直接打开课件提示“请从学生后台进入” | 正常保护；应从学生后台启动或使用本地 `?demo=1` |
| 运行基址根页面 404 | 这是运行基址，不是首页；检查具体课程和课件路径 |
| 成绩保存失败 | `launchToken` 是否过期、课程/课件是否开放、API 请求是否等待完成 |
| 返回后没有成绩 | 是否先跳转后保存、是否只给一个按钮绑定保存、`COMPLETED` 是否成功 |
| 分数显示 NaN | 重试状态未初始化、字符串参与计算、分母为 0、缺少有限数校验 |
| iPad 漏出源码或布局不全 | HTML 模板错误、未转义模型输出、固定高度溢出、缺少 Safari 实机验收 |
| 多图生成停在固定百分比 | 子任务失败未收敛；检查服务日志、超时、重试和真实任务状态 |
| 图片或字体线上缺失 | 资源使用根路径或外链；改为课件包内相对路径 |
| 课件被拒绝提交 | 教师可能关闭了课程或课件；平台会在提交时再次校验 |

## 17. 第三方团队交付内容

第三方最终应交付：

1. 完整课件源码目录。
2. 可上传平台的标准 ZIP。
3. `manifest.json` 字段说明。
4. 教学目标、计分规则、随机规则和作品数据说明。
5. 本地启动、测试和打包命令。
6. 端到端验收记录、兼容性截图和已知限制。
7. 版本号、Git 提交号或来源标识，以及 ZIP SHA-256。

不应交付：生产账号、密码、服务器密钥、数据库、真实学生数据、`.env`、运行日志或 Git 历史中的秘密。

## 18. 给 AI 编程 Agent 的最短任务模板

```text
请按《智课课件插件接入技术白皮书 v3》开发或修改该课件。

课件名称：{title}
课件 slug：{slug}
教学目标：{goal}
学生年龄：{age}
运行类型：{STATIC | NODE | BOTH | 请评估}
核心玩法：{gameplay}
需要保存：{score / summary / image / audio / video / process data}

要求：
1. 先读取现有源码、manifest 和白皮书，不改平台账号与数据库逻辑。
2. 从 URL 读取 launchToken、platformApiBase、returnUrl，不写死环境地址。
3. 完成时先上传必需附件，再等待 COMPLETED 成功，最后允许返回。
4. 实现有限分数、重试重置、重复点击保护、部分生成失败和清晰错误状态。
5. 所有运行资源本地化，适配桌面、iPad 横竖屏和手机。
6. 运行结构校验、浏览器端到端验收和秘密扫描。
7. 只交付源码、ZIP、SHA-256 和测试报告；没有明确授权不要部署生产环境。
```

本白皮书覆盖新课件开发、已有独立网页改造和现有智课课件修复。平台内部运维、数据库迁移和生产服务器部署不属于第三方课件插件的默认权限范围。
