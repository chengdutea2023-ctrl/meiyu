# 生产发布与回滚

## 发布原则

- 线上只运行已推送到 GitHub、通过验证的提交。
- 禁止直接上传本地源码覆盖生产目录，禁止在生产目录编辑源码。
- 发布前必须有数据库备份或 ECS 快照，并记录目标提交与回滚提交。
- `.env` 和 SSH 密钥永远不进入 Git。

## 本地预检

```bash
git status --short --branch
npm run deploy:preflight
git log -1 --oneline
```

预检必须确认工作区干净。若课件包或清单显示 `dirty`，停止发布。

## 服务器预检

```bash
ssh zhike-prod
cd /opt/zhimei-education-platform/app
git status --short --branch
git fetch origin main
git rev-list --left-right --count HEAD...origin/main
systemctl status meiyu-api nginx postgresql redis-server --no-pager
df -h
```

生产仓库有未提交内容、存在分叉、磁盘不足或数据库异常时停止发布，先备份并确认原因。

## 数据库备份

在服务器私密环境中读取数据库连接信息，不要打印密码：

```bash
install -d -m 700 /var/backups/zhike
backup=/var/backups/zhike/platform-$(date +%Y%m%d-%H%M%S).dump
node scripts/production-db-backup.cjs "$backup"
```

脚本从私密环境文件读取连接信息，通过 PG 环境传给工具，不把密码放在命令参数或输出中，并拒绝覆盖旧文件。只有 `pg_restore --list` 成功且文件非空才算有效备份，再按保留策略复制到 ECS 快照或独立存储。

## 发布

```bash
cd /opt/zhimei-education-platform/app
git pull --ff-only origin main
npm ci
npm run db:deploy
npm run build
systemctl restart meiyu-api
systemctl status meiyu-api --no-pager
curl -fsS https://data.docpine.online/api/health
```

管理后台若有变更，按现有 Nginx 静态目录发布构建产物；动态课件按平台发布接口和 systemd 服务流程处理。

## 正式课件源码对齐

七个正式课件有历史 runtime slug，不要直接按源码目录名覆盖。使用已提交的映射和脚本，先只读比较：

```bash
node scripts/courseware-sync.mjs --root /opt/zhimei-education-platform/courses
```

有差异时先审查来源、备份数据库和完整运行文件，再在服务器 Git 快进到验证提交后执行：

```bash
node scripts/courseware-sync.mjs --root /opt/zhimei-education-platform/courses --apply --backup /var/backups/zhike/<unique-release>/changed-source-files
node scripts/courseware-sync.mjs --root /opt/zhimei-education-platform/courses
```

脚本只更新正式源码文件，保留运行数据、密钥、旧备份和数据库 slug；manifest 的 slug 按历史映射改写。它不执行数据库更新和服务重启。Node 服务源码若变更，应逐个重启对应实例并验证健康检查，不能批量重启所有课件。新增 runtime 目录/发布状态仍走平台发布流程。

三个观鸟课件已有独立部署映射，必须显式指定映射与目录清单，避免触碰原七个课件：

```bash
node scripts/courseware-sync.mjs --root /opt/zhimei-education-platform/courses --mapping ops/bird-courseware-deployments.json --catalog coursewares/incoming-birds.json
```

审查差异并备份后，使用同样参数追加 `--apply --backup /var/backups/zhike/<unique-release>/changed-source-files`；完成后再次只读检查。观鸟密钥的 systemd drop-in 不属于源码同步范围，禁止覆盖或移除。

`ops/nginx/`、`ops/showcase/`、`ops/certbot/`、`ops/systemd/` 是本次归档的运维配置。安装前备份线上原件，执行 `nginx -t` / `systemctl daemon-reload`；不要自动安装临时账号脚本或覆盖只读账号到期配置。

### 邛窑三课件

统一交接入口：`docs/handoff/QIONG_COURSEWARES.md`。三个课件已登记，不重复创建；同步时使用独立映射：

```bash
node scripts/courseware-sync.mjs --root /opt/zhimei-education-platform/courses --mapping ops/qiong-courseware-deployments.json --catalog coursewares/incoming-qiong.json
```

审查后追加 `--apply --backup /var/backups/zhike/<unique-release>/changed-source-files`，完成后再次只读比较。2026-10-24保存恢复修复包含平台API的兼容性扩展，应先构建并重启主API、确认健康，再同步课件并重启修复服务。没有依赖或数据库结构变更时，不额外执行依赖升级或迁移。烧窑为静态课件；眼力2.0为BOTH，服务名meiyu-courseware-qiong-ai-inquiry-courseware-cmvi3hg5.service，端口4109。眼力服务代码变更仅重启该实例；保留其私密环境、20-qiong-vision.conf和独立计数目录。模板在ops/systemd/qiong-vision.conf，密钥不得复制入模板。新服务目录通过源码同步建立后，应核对其属主是否为平台运行账号；若需生产权限变更，先取得单独确认。

修复服务为 `meiyu-courseware-qiong-ai-inquiry-courseware-is9nlxd12-cmvis9nl.service`，端口4107。保留其systemd drop-in、私密环境、独立数据目录及请求计数；确认没有运行中的生图任务后再重启，不为验收追加额度或发起真实付费生成。回退主API和课件必须对应同一回滚点；没有迁移时禁止整库恢复。

本次回滚点与备份见 `BASELINE_20261008.md`。应用回滚后还要恢复匹配的课件源码和配置，数据库没有迁移时不要恢复数据库、覆盖新产生的业务数据。

## 验收

- 三个公共入口返回 200。
- `/api/health` 返回 `status: ok`。
- 管理员、教师、学生登录正常。
- 课件启动、返回、成绩保存正常。
- `BOTH` 课件的 Node 服务和生成流程正常。
- 日志无持续报错。

## 回滚

应用回滚使用已记录的上一个提交，不使用 `git reset --hard`：

```bash
git switch --detach <previous-commit>
npm ci
npm run build
systemctl restart meiyu-api
```

数据库迁移不得凭经验反向执行。需要恢复数据库时，先停止写入、保留故障现场，再按对应备份恢复并完成完整验收。
