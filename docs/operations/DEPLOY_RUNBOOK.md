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
db_url=${DATABASE_URL%%\?*}
backup=/var/backups/zhike/platform-$(date +%Y%m%d-%H%M%S).dump
pg_dump --format=custom --file="$backup" "$db_url"
pg_restore --list "$backup" >/dev/null
test -s "$backup"
```

Prisma 连接串中的 `schema` 查询参数必须先移除，`pg_dump` 不支持该参数。只有 `pg_restore --list` 成功且文件非空才算有效备份，再按既定保留策略复制到 ECS 快照或独立存储。

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
