# 邛窑 -AI看见了什么 2.0

智课 BOTH 课件。适合初中及以上，建议15–20分钟。学习目标是依据可见特征核对 AI 判断、控制单一图像变量并比较变化，了解信息不足时模型应当承认边界。文物是观察素材，AI不是文物鉴定工具。

## 流程与评分

识别原图 → 仅改变遮挡、旋转、模糊之一 → 再次识别 → 核对名称、可见依据与不确定之处 → 记录解释 → 概念题 → 提交实验卡。每次实验最多5次成功识别，每识别一次保存一条图片与文字判断。失败不计成功次数，手动重试可能产生额外的服务商请求。第一次先锁定原图，之后才开放处理工具；恢复原图只重置图片，不重复识别基准。同一器物和同一模型版本的原图与单变量变化形成对照；切换文物分别保留基准。

同一器物两次对照60分、至少12字观察20分、概念题20分。预测默认收起、选填，不计分。AI猜错不扣实验过程分；文字只检查完成度，不宣称自动理解解释质量。最多5条成功记录，达到上限仍能写观察、答概念题和提交。旧版更多记录完整保留，主区域显示最近5条。旧模型与云模型不混作同组对照。

11件真实文物，包含默认执壶和4件新增文物快捷切换、全部素材入口、大图和简单介绍。没有鼠标局部放大。

## 展示名称

2026-10-25：课件面向师生的名称统一为“计算机视觉”，包括介绍弹窗、连接状态、识别标签、新生成的PNG/TXT及提交摘要，不再显示供应商名称或具体型号。说明保留图像理解原理、可见依据和实测边界。实际服务配置、健康接口和JSON技术记录仍保留真实版本，保证追溯；历史已保存文件不改写。

## 实际模型和依据

默认模型 `doubao-seed-2-1-pro-260915`，火山方舟 Chat Completions 图像理解接口，以严格JSON Schema约束返回结构。固定提示词、temperature=0、关闭深度思考，每次只有当前处理后的实际图片。服务端拒绝额外的文物名称、标准答案等字段；调用体不包含文件名、学生预测、藏品说明、历史答案或前次图片。

结果为名称、1–3条可见依据、不确定之处，并标记“可辨认 / 暂不确定 / 信息不足”。状态由模型判断，不是校准概率；看不清可能仍会判断错误或产生幻觉。主界面没有人为生成的百分比、固定脚本答案或本地分类器回退。每条记录保留实际模型ID、提示词版本、提供商请求编号、用量及时间。

“模型与依据”提供通俗介绍、官方文档和公开的真实实测记录 `static/models/vision-validation.json`。记录是开发时实测，不是重新运行的评测，不代表所有文物的识别准确率。无法确认公开图片是否进入供应商预训练，因此不宣称模型从未见过。原 MobileNet 本地三分类文件作为旧版本材料保留，当前识别流程不再加载，旧训练/验证统计不能评价新模型。

官方依据：
- https://docs.volcengine.com/docs/ark/image-understanding?lang=zh
- https://docs.volcengine.com/docs/82379/1330310?lang=zh
- https://docs.volcengine.com/docs/ark/structured-output-beta?lang=zh

## 服务端与运行

`server/package.json` 含独立依赖和启动脚本，读取 `PORT`，默认仅监听127.0.0.1。平台分配端口；正式manifest的nodePort保持null。课件路径下相对访问 `./api/health` 和 `./api/recognize`，支持NEXT_PUBLIC_COURSE_BASE_PATH。

私密环境变量（不得入Git或ZIP）：
- `ARK_API_KEY`：只授权所选视觉模型的专用密钥。
- `ARK_VISION_MODEL`：默认上述固定版本；更换时需重新实测。
- `PLATFORM_API_BASE`：可信平台API，不采信请求传来的地址。
- `COURSEWARE_SLUG`、`COURSE_SLUG`：核对平台启动身份，源码默认slug与历史线上slug通过部署映射配置。
- `COURSEWARE_DATA_DIR`：独立持久目录。保存请求计数、图片哈希和结果，不保存密钥、launchToken或图片正文。
- `VISION_MAX_REQUESTS`：服务总请求上限，默认1000；含失败/不确定请求，不因重启清空。
- `VISION_PUBLIC_DEMO_LIMIT`：公开体验的服务总共享额度，默认0关闭。必须显式有限值启用；用完后提示从学生后台进入。正式课堂独立验证launchToken。
- `ALLOW_LOCAL_DEMO=1`：只用于本机测试，无需平台凭证；禁止生产使用。
- `COURSEWARE_ENV_FILE`：可选私密env文件路径。

平台启动凭证每次识别都由服务端验证课程、课件、学生和任务。不另建登录、不直连平台数据库。每个身份/实验服务端最多5条成功或进行中的请求；每个请求ID及图片哈希去重，浏览器网络重试复用同一ID。服务端不自动再次调用付费模型。供应商超时或连接中断可能已计费，明确标记结果未确认；只允许用户主动发起新请求。最多4个同时调用，超额提示稍后重试。请求≤2.2MB，解码像素上限768×512，移除元数据后只把当前画布像素送往火山。

## 本机验证

根目录安装依赖后运行：

```
npm run coursewares:vision:build
npm run coursewares:vision:test
PORT=4198 ALLOW_LOCAL_DEMO=1 COURSEWARE_ENV_FILE=/absolute/private/vision.env node coursewares/qiong-ai-vision-challenge/server/server.js
```

打开 `http://127.0.0.1:4198/?demo=1`。真实模型调用需要已配置专用密钥。普通自动化测试使用明确的接口替身，不产生火山费用；真实模型验收必须另行记录，不能用替身结果冒充。

## 保存和交付

launchToken/platformApiBase/returnUrl验证后STARTED，实验节点PROGRESS。完成时先上传PNG实验卡、TXT完整记录、JSON实验数据（含每次实际处理后图片，供投屏逐图展示），再等待COMPLETED。失败锁定提交快照，重试复用已上传附件。PNG概括最近一组对照，TXT/JSON保留全部判断、依据、边界和来源。草稿只存当前浏览器，不保存启动令牌。完成后清除草稿；重新开始仅清理本地本次实验。

干净提交运行 `npm run coursewares:vision:package`，ZIP含manifest、README、static和server源码/依赖锁文件，不含node_modules、私密配置、运行数据或Git。上线先备份数据库、旧运行目录及服务配置，通过平台分配动态端口和启动服务；发布只快进到验证提交。

照片来自 Wikimedia Commons，逐件许可见素材目录和来源弹窗。Kcx36为CC BY-SA 4.0，Daderot为公有领域，Gary Todd为CC0。裁切与实验处理后的CC BY-SA照片延续同许可。字体霞鹜文楷OFL-1.1。旧MobileNet及TensorFlow.js为Apache-2.0，当前不会执行。纸纹为生成素材。
