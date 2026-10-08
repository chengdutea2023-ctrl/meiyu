# 本地开发接管

唯一主目录：`/Users/zeng/工作/代码块/meiyu`。源码在 Git，生产数据和密钥不在 Git。

## 环境与初始化

- 推荐 Node.js 22 LTS；本次核验使用已安装的 Node.js 25.1.0。
- PostgreSQL 18、Redis 7。本地使用 Colima + Docker，不依赖已卸载的 Docker Desktop。
- `docker-compose` 独立命令或 Docker Compose 插件均可。

```bash
cd "/Users/zeng/工作/代码块/meiyu"
npm ci
colima start --cpu 2 --memory 4 --disk 30
npm run local:init
npm run local:infra
npm run prisma:generate
npm run db:deploy
```

`local:init` 创建随机本地密码和 JWT 密钥，同时生成被忽略的根 `.env` 与 `platform/api/.env`。已有文件拒绝覆盖；必须先备份，必要时使用 `--replace-backed-up-env`，脚本仍会保存旧文件。数据库只监听 `127.0.0.1:55432`，Redis 只监听 `127.0.0.1:6379`。Compose 使用新的 `postgres18_data` 卷，不能复用 PostgreSQL 16 数据卷。

`local:infra` 使用独立 Docker 配置，避免调用残留的 `docker-credential-desktop`。其他 Docker 主机可设置 `LOCAL_DOCKER_HOST`。镜像下载失败时检查网络代理，不改用未知镜像或关闭 TLS 校验。

空白数据库可运行 `npm run db:seed`；**从生产快照恢复的数据库禁止运行 seed**。

## 恢复独立快照

本次目标数据库为 `zhike_dev_20261008`。原始快照在 `~/.zhike-agent-secrets/rebaseline-20261008/`，不可提交或交付第三方。

新机器恢复时，用 `pg_restore --no-owner --no-acl` 导入单独的本地 PostgreSQL 18 数据库；解包私密运行文件快照，然后执行：

```bash
node scripts/local-copy-snapshot.mjs /absolute/path/to/extracted-private-snapshot
npm run local:adapt-snapshot
```

脚本要求数据库指向本机 `55432`。拷贝脚本拒绝覆盖已有本地目录，应先将旧目录移入私密备份。它恢复课件、作品和四格故事媒体，但不复制生产环境、运行凭据、PID、依赖和旧备份。

适配只影响本地：入口改 localhost，作品路径改为本地，清除导入的登录/启动令牌，禁用指向线上的第三方应用，创建独立管理员/教师/学生和测试班。原始业务用户、课程、成绩和作品不删除。随机本地账号在 `~/.zhike-agent-secrets/local-development/accounts.json`。生产密码与 JWT 不用于本地服务。

本地 AI 密钥默认未配置，真实付费生成需单独配置测试密钥；不能把“界面与接口通过”写成“真实生成已验证”。快照不是实时同步，线上后续新增数据不会自动进入本地，禁止将本地数据库反向覆盖生产。

## 日常启动

```bash
npm run local:infra
npm run build
npm run local:start
```

`local:start` 启动 API、后台和两个动态课件，只监听本机，日志/PID 清单在被忽略的 `output/local-services/`。端口已占用时拒绝启动，必须先核对现有进程。调试可分别使用 `npm run dev:api`、`npm run dev:admin -- --host 127.0.0.1`，不能与统一启动同时抢占端口。

两项旧 launchd 任务 `com.zhimei.meiyu-api` / `com.zhimei.meiyu-admin-web` 已备份并停用，避免自动重启导致双服务。它们的 plist 仍保留；恢复前先停止新服务并修正旧任务的监听和环境。

包含真实学生数据的本地副本不得向局域网开放。后台角色入口为 `/?portal=teacher`、`/?portal=student`。

| 服务 | 地址 |
| --- | --- |
| 后台 | http://localhost:5173 |
| API | http://localhost:3000/api/v1 |
| 健康检查 | http://localhost:3000/api/health |
| Swagger | http://localhost:3000/api/docs |

教师、学生通过后台对应身份入口访问，路由以源码为准。课件从本地课程启动，或明确使用 `?demo=1`；本地页面不能继续调用生产成绩接口。

## 修改与发布

只在 `coursewares/<slug>/` 修改源码，不在被忽略的运行目录修改。历史部署映射见 `ops/courseware-deployments.json`，不能随意重命名数据库中的 ID/slug。

```bash
npm run agent:doctor
npm run agent:check
npm run coursewares:package
```

正式包必须来自干净 Git 提交。新功能使用独立分支，验证后合并发布。
