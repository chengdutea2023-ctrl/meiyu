# 观鸟小课堂

- slug: `birdai`；运行类型: `BOTH`；平台入口: `/`（映射到 `static/index.html`）。
- 保留找鸟、看图辨认、鸟叫声、鸟类科普、AI 识别和学习问卷。
- 正式模式须先验证 `launchToken`，再上报 `STARTED` / `PROGRESS`。
- 问卷提交先上传 JSON 作品，再保存 `COMPLETED`；`score: null` 表示未评分、待评价，不写成 0 分。此标记不代表已实现教师在线批改功能。
- 保存失败后保留原提交内容，仅补传失败文件或重试成绩保存；完成后不再上报进度。
- `?demo=1` 仅预览，不保存成绩，也不调用付费识别。

## 服务端

在 `server/` 执行 `npm ci`，由平台提供环境配置后执行 `npm start`：

- 必需：`PORT`、`PLATFORM_API_BASE_URL`（例如平台的 `/api/v1` 地址）、`COURSE_SLUG`、`COURSEWARE_SLUG`。
- 正式 AI 识别另需：`DONGNIAO_API_KEY`，仅由管理员在服务器环境配置。
- `NEXT_PUBLIC_COURSE_BASE_PATH`：平台分配的 `/<courseSlug>/<coursewareSlug>`。
- `HOST` 默认 `127.0.0.1`。可选：`DONGNIAO_ENDPOINT`、`DONGNIAO_DEVICE_ID`。

识别请求必须携带 `X-Course-Launch`，服务端向可信的平台地址验证所属学生、课程和课件。无凭证、过期、关闭或只读体验不能调用识别。运行状态也需凭证；`/api/health` 仅返回服务及配置状态，不包含密钥。

每次识别总超时 90 秒；每启动会话最多每分钟 6 个新任务、同时 1 个任务，全进程同时最多 2 个任务。相同启动凭证和相同图片短暂复用 10 分钟，避免连续重复请求；缓存为进程内缓存，重启会清空，不保证第三方计费幂等。

图片和音频随包提供。原包音频标有 Xeno-canto 录音编号，但未附逐条完整许可证明；正式对外商用前需由素材提供方确认授权。真实懂鸟服务、配额及教学内容准确性需上线前另行验收。
