# 新课件 Codex 开发启动包

版本：v1  
更新日期：2026-06-16  
适用对象：内部课件开发者、使用 Codex 开发课件的团队成员  
配套主文档：`docs/14-courseware-integration-whitepaper-v2.md`

这份文档用于开启一个新的 Codex 对话或新开发线程。项目负责人可以把本文档直接发给课件开发者，也可以把“第 2 章启动提示词”复制到新的 Codex 对话里。

## 1. 使用方式

建议每个课件单独开一个 Codex 对话：

- 业务底座问题继续在业务底座对话处理。
- 每个课件单独一个对话，例如“AI 工具判断课件”“你猜我画课件”“环保小岛课件”。
- 同一个课件的小改动可以留在同一个课件对话里。

这样做的好处是：课件代码、课件设计、课件 ZIP 打包和业务底座代码不会混在一起，调试会更快，也更不容易把底座逻辑改乱。

新对话开始时，先发：

1. 本文档。
2. `docs/14-courseware-integration-whitepaper-v2.md`。
3. 课件需求说明。
4. 如果有视觉参考图、教学脚本、题库或素材，也一起发。

## 2. 给 Codex 的启动提示词

把下面这段复制到新的 Codex 对话里，然后把方括号内容替换成你的课件信息。

```text
我要开发一个接入“智美教育新生态业务底座”的内部课件。

请严格按照以下平台规范开发：

1. 课件不是独立用户系统
- 不做登录。
- 不做注册。
- 不做找回密码。
- 不保存底座账号密码。
- 不直接连接底座数据库。

2. 课件必须从学生后台进入
- 从 URL 读取 launchToken、platformApiBase、returnUrl。
- 不允许写死 localhost、data.docpine.online、agent.docpine.online、固定端口或服务器密钥。
- 没有 launchToken 时提示“请从学生后台进入课件”。

3. 返回学生后台必须明显
- 课件页面必须有清晰的“返回学生后台”按钮。
- 不能只放在左上角或页面边缘。
- 主要操作区附近也要有返回入口。
- 完成或保存失败后，也要出现“回到学生后台”按钮。
- 返回逻辑优先使用 returnUrl，没有 returnUrl 时使用 history.back()。

4. 成绩和数据必须回流到底座
- 完成学习后必须上报 COMPLETED。
- 必须上报 score、durationSeconds、summary。
- 如果有图片、录音、视频、文件或作品数据，必须用底座附件接口上传，或按白皮书要求提供可访问作品链接。
- 所有课件都必须支持教师查看成绩和投屏。

5. 投屏标准
- 优先让业务底座使用 summary 和附件生成默认投屏页。
- 如果课件需要自定义投屏页，必须在 summary.projectorUrl 或 summary.screenUrl 返回可访问地址。
- 投屏页要适合教师课堂展示，不要只显示调试文字或 JSON。

6. ZIP 交付
- 最终交付一个可以在业务底座后台上传的 ZIP。
- ZIP 根目录必须有 manifest.json。
- 不要打包 node_modules、.git、.env、服务器密码、数据库密码、管理员密码或 APP_SECRET。
- 静态资源、图片、音频、模型文件、第三方前端库都必须随 ZIP 一起交付，不依赖境外 CDN。

课件名称：
[填写课件名称]

教学目标：
[填写教学目标]

学生年龄：
6-12 岁

课件类型倾向：
[网页课件 / 服务课件 / 网页+服务课件 / 由 Codex 根据需求判断]

核心玩法：
[填写玩法，例如选择题、绘画、拖拽、录音、AI 对话、实验模拟]

需要保存的数据：
[填写是否需要保存分数、图片、画作、录音、视频、过程数据、投屏页面]

交付要求：
- 先给出实现方案和目录结构。
- 再开始编码。
- 本地自测通过后，打包 ZIP。
- 最后给出上传到业务底座的操作说明和自测结果。
```

## 3. 课件必须遵守的业务边界

课件只负责“学习互动”，业务底座负责“账号、班级、排课、权限和记录”。

课件不能做：

- 学生注册。
- 教师注册。
- 登录页。
- 密码找回。
- 自己保存学生账号密码。
- 自己决定学生属于哪个班。
- 自己决定这堂课是否开始。
- 自己决定某个课件是否开放。
- 直接访问业务底座数据库。

课件必须做：

- 从学生后台启动。
- 读取 `launchToken`、`platformApiBase`、`returnUrl`。
- 校验启动上下文。
- 完成后上报成绩。
- 保存或上报作品数据。
- 提供明显返回学生后台按钮。
- 支持教师查看结果和投屏。

## 4. 课件类型选择

### 4.1 网页课件

适合：

- 选择题。
- 判断题。
- 拖拽题。
- 简单互动游戏。
- 前端可以直接计算成绩。

交付结构：

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

网页课件也必须支持成绩记录和投屏。做法是：完成时向底座上报结构化 `summary`，并上传需要展示的图片或文件附件。

### 4.2 服务课件

适合：

- 服务端渲染页面。
- 服务端保存作品。
- 需要自定义 API。
- 需要自定义投屏页。

交付结构：

```text
courseware.zip
  manifest.json
  server/
    package.json
    server.js
```

### 4.3 网页 + 服务课件

推荐给复杂课件：

- 画作。
- 录音。
- 视频。
- AI 对话。
- 模型识别。
- 复杂过程数据。
- 教师投屏展示。

交付结构：

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

如果课件涉及“学生作品、画作、录音、视频、投屏页面、复杂过程数据”，优先选择“网页 + 服务课件”。

## 5. manifest.json 模板

```json
{
  "slug": "courseware-name",
  "title": "课件名称",
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

说明：

- `runtimeType` 可选 `STATIC`、`NODE`、`BOTH`。
- `nodePort` 默认写 `null`，由业务底座自动分配。
- `slug` 可以写建议值，但最终访问短名由后台生成和识别。
- 不要写死 `4102` 之类固定端口。

## 6. 启动参数读取模板

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

## 7. 返回学生后台按钮规范

不要只把返回按钮放在左上角。不同浏览器、投屏分辨率、iPad 横屏或缩放比例下，左上角按钮可能看不到。

推荐同时提供三个位置：

1. 页面顶部或左上角：作为常规导航。
2. 主操作区附近：例如“提交答案”旁边。
3. 完成或保存失败后：结果弹窗或结果面板里提供“回到学生后台”。

按钮示例：

```html
<button type="button" class="secondary-action" id="backToStudent">
  返回学生后台
</button>

<script>
  document.querySelector('#backToStudent').addEventListener('click', backToStudentPortal);
</script>
```

完成提示示例：

```html
<section class="completion-panel">
  <h2>已提交</h2>
  <p>你的成绩已经保存，老师可以在后台查看。</p>
  <button type="button" onclick="backToStudentPortal()">回到学生后台</button>
</section>
```

## 8. 成绩上报模板

课件完成后，至少上报：

- `status: "COMPLETED"`
- `score`
- `durationSeconds`
- `summary`

示例：

```js
async function submitScore({ score, durationSeconds, summary }) {
  return platformPost('/course-runtime/launch/records', {
    launchToken,
    status: 'COMPLETED',
    score,
    durationSeconds,
    summary,
  });
}
```

`summary` 用来给学生后台、教师后台和投屏页展示，不要只放技术字段。

推荐：

```js
const summary = {
  title: '哪些是 AI 工具？',
  displaySummary: '完成 10 题，答对 8 题',
  correctCount: 8,
  totalCount: 10,
  answers: [
    { title: '图像生成工具', selected: true, correct: true },
    { title: '普通搜索网页', selected: true, correct: false }
  ]
};
```

不推荐：

```js
const summary = {
  source: 'course-launch',
  launchSessionId: 'xxx'
};
```

## 9. 附件上传与作品数据

如果课件有图片、录音、视频或文件，应上传到底座附件接口，或按白皮书约定返回可访问链接。

典型作品类数据：

- 最终图片。
- 每一轮画作。
- 录音文件。
- 视频文件。
- 过程数据。
- AI 识别结果。
- 学生答案。
- 教师投屏需要展示的数据。

画作类 `summary` 示例：

```js
const summary = {
  title: '你猜我画',
  displaySummary: '完成涂鸦识别挑战，识别成功 7/8',
  score: 87,
  rounds: [
    {
      round: 1,
      prompt: '树',
      score: 14,
      recognized: true,
      imageUrl: 'https://...',
      guesses: ['树', '山', '帐篷']
    }
  ],
  artifactUrls: {
    finalImage: 'https://...',
    workPage: 'https://...'
  }
};
```

## 10. 投屏标准

所有课件都应支持投屏。

平台标准是：

- 课件上报成绩和 `summary`。
- 课件上传图片、录音、视频等附件。
- 业务底座根据这些数据生成默认投屏页。

如果课件需要更强的课堂展示效果，可以提供自定义投屏页，并在 `summary` 里返回：

```js
const summary = {
  projectorUrl: 'https://...',
  screenUrl: 'https://...'
};
```

投屏页要求：

- 显示学生姓名、班级、课件名称。
- 显示分数、完成状态、耗时。
- 显示作品图片或关键成果。
- 适合大屏展示。
- 不显示原始 JSON。
- 不显示调试日志。

画作类投屏页必须展示全部画作，不只展示最终图。每张图的得分、识别结果放在图片下方，不遮挡画面。

## 11. ZIP 打包规则

打包前检查：

- `manifest.json` 在 ZIP 根目录。
- `static/` 或 `server/` 路径正确。
- 不包含 `node_modules/`。
- 不包含 `.git/`。
- 不包含 `.env`。
- 不包含服务器密码、数据库密码、管理员密码或 APP_SECRET。
- 不依赖外部 CDN。
- 不写死线上或本地地址。

推荐打包命令：

```bash
cd your-courseware
zip -r ../your-courseware-current.zip manifest.json static server \
  -x "*/node_modules/*" "*/.git/*" "*/.DS_Store" "*/.env"
```

如果是纯静态课件：

```bash
cd your-courseware
zip -r ../your-courseware-current.zip manifest.json static \
  -x "*/node_modules/*" "*/.git/*" "*/.DS_Store" "*/.env"
```

## 12. 自测清单

开发者交付前必须自测：

- ZIP 上传后 manifest 校验通过。
- 课件能从学生后台进入。
- URL 里有 `launchToken`、`platformApiBase`、`returnUrl`。
- 没有 `launchToken` 时提示从学生后台进入。
- 返回学生后台按钮明显可见。
- 完成后有“回到学生后台”入口。
- 成绩能回流。
- 教师后台能看到分数、耗时、完成状态。
- 学生后台能看到自己的学习记录。
- 有作品的课件能看到图片、录音、视频或文件。
- 投屏页能打开。
- iPad 横屏、普通笔记本、低分辨率浏览器都能找到主要按钮。
- 浏览器控制台没有核心错误。
- 断开外部网络后核心功能不依赖 CDN。

## 13. 常见错误

### 13.1 打开课件提示没有身份

原因：不是从学生后台进入，缺少 `launchToken`。

处理：从学生后台任务入口进入，不要直接打开课件裸 URL。

### 13.2 成绩保存失败

常见原因：

- `launchToken` 过期。
- 老师已经结束课程。
- 老师关闭了该课件。
- 请求没有使用 `platformApiBase`。
- 上报路径写错。

处理：重新从学生后台进入课件，并检查接口调用。

### 13.3 投屏页没有图片

常见原因：

- 课件没有上传附件。
- `summary` 里只有文本，没有图片 URL。
- 图片 URL 是课件内部临时地址，线上无法访问。
- 投屏页只读最终图，但没有读每轮画作。

处理：把作品图片上传到底座附件，或提供可访问的作品页和投屏页。

### 13.4 线上打不开但本地可以

常见原因：

- 依赖外部 CDN。
- 写死 `localhost`。
- 写死本地端口。
- ZIP 没有包含静态资源。
- Node 服务没有使用平台分配的 `PORT`。

处理：改成读取平台环境变量和 URL 参数，重新打包上传。

## 14. 交付给项目负责人的内容

每个课件交付时，至少提供：

```text
1. 课件 ZIP
2. 课件名称
3. 课件类型：网页课件 / 服务课件 / 网页+服务课件
4. 教学目标
5. 操作说明
6. 自测结果
7. 是否支持附件
8. 是否支持投屏
9. 已知限制
```

示例：

```text
课件名称：你猜我画
课件类型：网页+服务课件
教学目标：让学生体验 AI 图像识别的基本过程
附件：保存每轮画作图片
投屏：支持，展示全部画作和每轮得分
成绩：按识别成功数和回合表现计算
ZIP：quickdraw-web-lab-current.zip
```

## 15. 给课件开发者的最终提醒

课件开发的成功标准不是“页面能打开”，而是完整跑通这条链路：

```text
管理员上传课件
  -> 老师排课并开放课件
  -> 学生从学生后台进入
  -> 学生完成学习
  -> 成绩和作品回流到底座
  -> 老师能查看详情
  -> 老师能投屏展示
  -> 学生能回到学生后台
```

只要这条链路没跑通，就还不能算完成交付。
