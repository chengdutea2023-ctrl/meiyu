# 邛窑AI修复挑战生产安装记录

2026-10-22，状态：已安装，生产真实课堂验收待完成。

## 版本与入口

- 运行源码：`8e03ac946170a157acc4da478e0692a5424d28ee`，已推送 GitHub；后续部署映射与本记录为运维文档变更。
- 标准包：`qiong-ai-restoration-challenge-8e03ac946170.zip`，24814521字节。
- SHA-256：`0f2359e169224c6650093cb6fec491f3a63705416216393c097b76da2c93efb2`。
- 课程：邛窑AI探究，`qiong-ai-inquiry`。
- 平台实际分配课件短名：`courseware-is9nlxd12`，内部端口4107；源清单短名仍为`qiong-ai-restoration-challenge`。
- 入口：https://agent.docpine.online/qiong-ai-inquiry/courseware-is9nlxd12/ ，正式操作须从学生后台获有效启动凭证。
- 独立单元：`meiyu-courseware-qiong-ai-inquiry-courseware-is9nlxd12-cmvis9nl.service`。
- 运行目录：`/opt/zhimei-education-platform/courses/qiong-ai-inquiry/coursewares/courseware-is9nlxd12`。
- 私密配置：`shared/qiong-restoration.env`，属主meiyu，权限600；独立数据目录`shared/qiong-restoration-data`，属主meiyu，权限700。
- 绑定位于该单元的`20-qiong-restoration.conf` drop-in；仅记录配置文件路径，不记录Key值。普通重部署保留此drop-in。

## 已验证范围

本地完整真实生成和报告保存已通过。运行短名兼容修复后再次执行`agent:check`：课件16项测试、全部平台测试与构建、7+3+3课件结构校验、833文件秘密扫描通过；干净main的`deploy:preflight`通过。新ZIP经便携校验器验证无错误、无警告。

生产通过正常管理员界面登记、上传并部署；manifest由平台改写为实际短名与端口。专用Key仅允许Flash的Model ID，创建后模型列表请求200；尚未发起生图。正式服务健康返回configured=true、mocked=false、requestsUsed=0、requestLimit=3；无启动凭证的session请求401。关键运行源码与发布提交一致，Nginx配置检查通过，主API、数据库、Redis和新服务均active。

课程现引用眼力挑战与修复挑战两个课件；上线前仅有眼力挑战，未增删旧课件或调整真实班级。源清单中的窑火课件不代表已在此课程注册运行，本次未重新登记它。

初次绑定配置时文件归属root导致运行用户无权读取；已纠正归属，保持600/700，再经平台部署操作同步运行PID并复查。早期错误日志保留作诊断，不代表当前状态。

## 预算与未完成项

本地6次请求中3次鉴权拒绝、3张成功，按单张0.12元估计0.36元，实际账单未逐笔核验。用户另行授权线上3次请求（估计0.36元）及线上专用Key。当前线上计数0，持久化上限3，尚未发起线上生图。

旧线上隔离账号均正常登录失败401；未导出线上历史密码、未重置密码、未绕过认证。新增隔离教师和学生各1名及1个测试班的实际创建被自动权限审核拦截，待用户明确授权数量、角色和验收后停用。未创建这些账号或课堂。

待完成：学生正式启动→3组真实生成→证据审查→PNG及ZIP上传→COMPLETED且score=null→教师/学生查看与投屏→关闭测试课堂并停用新测试账号。生产全流程验收尚未完成，当前上限也不是正式班级长期额度。

## 备份与回退

首次生产变更前备份：`/var/backups/zhike/qiong-restoration-20261022-01/`。数据库dump为378312字节，SHA-256 `2f951680f5e2ebeb95c0ef0ab960004cd399ccc7c25009162fbf57420459b90b`，pg_restore列表检查通过。包含相关配置归档、发布前提交`50e56291ae8adef4849075f4e62525c3f0d961d6`和经验证的Git增量包。GitHub从服务器拉取遇TLS中断，使用Git bundle验证前置提交后快进；未覆盖生产源码目录、未执行数据库迁移。

若新增课件异常，先在平台将此课件改回草稿并关闭其测试课堂，再停止该独立单元；保留其数据和附件以供追溯。恢复新课件配置/版本只影响本课件，不整库回滚覆盖后续业务数据。不得批量重启其他课件。
