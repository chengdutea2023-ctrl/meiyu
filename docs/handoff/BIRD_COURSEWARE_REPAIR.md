# 三个观鸟课件接入修复

本次只修复源码和生成候选发布包，不部署线上、不创建生产课程或指定生产端口。原始三个 ZIP 保留不变。

候选清单为 `coursewares/incoming-birds.json`。与已上线七个课件的 `catalog.json` / `ops/courseware-deployments.json` 分开管理，避免误将候选源同步到现有课程。部署时确认所属课程、运行 slug、端口和懂鸟配置后，再登记生产映射。

## 检查与打包

```bash
npm run lint
npm run build
npm run coursewares:test
npm run coursewares:validate
npm run secrets:scan
npm run coursewares:birds:package
```

专项测试 `scripts/bird-courseware.test.mjs` 在 API 构建后执行，覆盖已完成记录保护、并发进度保护、空分数、附件 MIME、上传/保存失败重试和识别权限。

`node scripts/bird-courseware-local-acceptance.cjs` 仅允许 `localhost/127.0.0.1:55432` 数据库，读取单独存放的本地测试账号，不打印凭据。可通过 `ZHIKE_LOCAL_ENV_FILE` 指定本地配置路径。它创建独立验收课程、在 3301 端口启动 API，检查启动、静态资源、附件、成绩、教师读取、过期与只读凭证，然后删除本次创建的课程并停止 API；不操作已有课程。测试文件和日志位于忽略的 `output/`，不进入课件包。

## 平台配套修复

`COMPLETED` 记录不能再被迟到的 `STARTED` 或 `PROGRESS` 覆盖；更新条件在数据库写入时再次检查，防止读取之后的并发完成被降级。`score: null` 表示未评分，师生和后台记录视图同步显示未评分，真实 0 分仍显示 0 分。无数据库结构变更。

观鸟与 YOLO 不自动打分；候鸟仍按原过程规则计分。待评价仅表示未评分状态，本次未添加教师在线批改系统。

生产发布前仍需实际 iPad/摄像头测试、懂鸟真实服务及配额验收、原包模型/图片/音频授权确认。浏览器模拟尺寸不能替代真实 iPad 验收。
