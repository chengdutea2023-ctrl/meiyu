# 邛窑三课件统一交接

最近现场核对：2026-10-24。三款均已在《邛窑AI探究》（`qiong-ai-inquiry`）发布，并已进入 Git 主线；各自独立启动、实验和提交，不要求先完成其他课件。只有修复挑战需要课外整理资料。

## 课件与运行身份

| 编号 | 名称 | 源码目录 | 生产短名 | 类型 / 端口 | 提交结果 |
| --- | --- | --- | --- | --- | --- |
| 01 | 邛窑AI烧窑挑战 | `coursewares/qiong-kiln-challenge` | `qiong-kiln-challenge` | STATIC / 无 | 过程分、TXT、JSON |
| 02 | 邛窑AI眼力挑战 | `coursewares/qiong-ai-vision-challenge` | `courseware` | STATIC / 无 | 过程分、PNG、TXT、JSON |
| 03 | 邛窑AI修复挑战 | `coursewares/qiong-ai-restoration-challenge` | `courseware-is9nlxd12` | BOTH / 4107 | 未评分、报告PNG、证据ZIP |

源码清单以 `coursewares/incoming-qiong.json` 为准；生产路径映射以 `ops/qiong-courseware-deployments.json` 为准。运行目录统一为 `/opt/zhimei-education-platform/courses/qiong-ai-inquiry/coursewares/<生产短名>/`。不得用源码目录名重新登记已经存在的课件，也不得改数据库中的既有 ID 或短名。

烧窑学习状态、动作、奖励和 Q-learning；眼力学习已训练模型的推理、输入变化和类别边界；修复学习参考条件、控制变量和证据核验。参考图不是重新训练模型，修复候选不是历史原貌。评分方式不同是教学设计，不把“未评分”换成0分。

## 统一命令

| 范围 | 构建 | 测试 | 打包 |
| --- | --- | --- | --- |
| 三款全套 | `npm run coursewares:qiong:build` | `npm run coursewares:qiong:test` | `npm run coursewares:qiong:package` |
| 仅烧窑 | `npm run coursewares:kiln:build` | `npm run coursewares:kiln:test` | `npm run coursewares:kiln:package` |
| 仅眼力 | `npm run coursewares:vision:build` | `npm run coursewares:vision:test` | `npm run coursewares:vision:package` |
| 仅修复 | `npm run coursewares:restoration:build` | `npm run coursewares:restoration:test` | `npm run coursewares:restoration:package` |

烧窑不需要打包编译，build执行三份浏览器脚本的语法检查。全套命令按01、02、03顺序执行，任何一步失败即停止。2026-10-24之前的 `qiong:package` 只代表烧窑、`qiong:build/test` 只代表修复，旧说明不再适用于当前命令。

正式打包前运行 `npm run agent:check`，提交并保持工作区干净后打包。三个输出目录分别为 `output/qiong-kiln-release/`、`output/qiong-vision-release/`、`output/courseware-releases/`。发布包必须核对提交号、SHA-256和manifest，不能把dirty包当正式交付。

## 测试任务命名

保留既有任务 ID、班级、教师、学生、成绩和开放状态，只统一标题：`邛窑测试 01 - AI烧窑挑战`、`邛窑测试 02 - AI眼力挑战`、`邛窑测试 03 - AI修复挑战`。旧的已结束副本标为 `历史测试 - AI眼力挑战（已结束）`，不删除其记录。

每个测试任务只开放自己的课件；不要因三个课件共享课程容器就批量开放。测试账号和任务ID只保存在私密交付记录，不写入源码或公共包。

## 发布边界与回退

先检查生产Git干净且可快进、API/数据库/Redis健康，再创建数据库与三款运行目录的私密备份。先发布平台的兼容性接口，再同步课件前端；保留修复服务的环境drop-in、独立数据目录、已生成图片和持久化请求计数。

修复课件的生图额度是服务总额度，不是每名学生的配额；重启不会清零。检查和回归默认不调用真实生图、不擅自加额度。正式课堂前应另外确认预算与人数，不能把测试额度当作全班容量。

源代码、运行包、业务数据和验收证据分别核对。线上README旧文字不代表服务未发布，单课件历史记录以其日期为准；当前三款状态优先看本文件和当次发布回执。

回退仅恢复本次变更的代码/运行文件或任务标题，不整库恢复、不删除既有附件。单课件历史证据分别见 `QIONG_KILN_RELEASE.md`、`QIONG_VISION_RELEASE.md`、`QIONG_RESTORATION_RELEASE.md`。

## 本次修复验收

2026-10-24本地完整检查通过：93项自动化测试、13款课件清单校验及敏感信息扫描。Chrome五种视口（390×844至1440×1024）合计14组浏览器检查通过：眼力的遮挡/旋转/模糊面板不再覆盖实验记录；修复在清空浏览器缓存后仍按平台完成记录恢复“已保存”，附件响应丢失和完成响应丢失均可恢复，过期启动凭据不会显示已保存。

恢复依据来自当前学生、任务、班级和课件的服务端记录及附件元数据，不信任导入包中的saved标记。附件内容哈希与稳定ZIP时间戳用于跨刷新复用，不重复上传已确认的相同附件；不宣称不同浏览器标签页同时提交具备分布式去重保证。

浏览器故障测试使用本地隔离夹具，不调用真实生图、不写生产成绩；视口模拟不等同于真实iPad Safari验收。实际线上安装与健康检查应另记发布回执，不以本地通过代替发布完成。
