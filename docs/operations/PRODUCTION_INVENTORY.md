# 生产环境清单

最后现场核验：2026-10-09。状态会变化，发布前再次检查。

## 主服务器

| 项目 | 当前记录 |
| --- | --- |
| ECS 公网 IP | `47.109.198.96` |
| SSH | `ssh zhike-prod`，root，专用密钥 |
| 代码中心 | https://github.com/chengdutea2023-ctrl/meiyu |
| 生产源码 | `/opt/zhimei-education-platform/app` |
| API 环境 | `/opt/zhimei-education-platform/shared/api.env` |
| 课件运行目录 | `/opt/zhimei-education-platform/courses` |
| 作品附件 | `app/platform/api/learning-artifacts` |
| 展示首页 | `/opt/zhimei-education-platform/showcase/index.html` |
| Nginx 生效文件 | `/etc/nginx/sites-enabled/meiyu.conf`（普通文件，不是符号链接；以 `nginx -T` 为准） |
| API 服务 | `meiyu-api.service` |
| HTTPS 证书 | `/etc/letsencrypt/live/docpine-online/` |
| 续签 | `certbot.timer`；webroot `/opt/zhimei-education-platform/acme` |
| 续签后重载 | `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh` |

公共入口：

- 管理员：https://data.docpine.online
- 教师：https://teacher.docpine.online
- 学生：https://student.docpine.online
- 课件：https://agent.docpine.online
- 展示：https://agent.docpine.online/showcase/
- 健康检查：https://data.docpine.online/api/health

单 ECS 上 Nginx 提供后台/课件静态文件，代理 Node.js API `3000`；API 使用 PostgreSQL 18 `127.0.0.1:5432`、Redis `127.0.0.1:6379`。七个正式课件中的四格故事和你猜我画还有独立 Node 进程，端口为 `4103` 和 `4108`。`4102`、`4105` 是历史/归档实例。现场实测 API `3000` 与历史生态岛 `4102` 仍监听全部网卡；限制到本机的 override 已入库但尚未安装，等待明确批准。其他动态课件只监听本机。实际服务名与监听以 systemd/ss 为准。

2026-10-09 新增《AI 观鸟探究》（`course-0cvxrc14m`），课程草稿、未分配班级。环境物体识别 `4104` 和观鸟小课堂 `4106` 只监听 `127.0.0.1`，候鸟迁徙实验室为静态课件。全局后台现有 11 项（10 个有效正式课件及历史 `test2`）。观鸟 AI 密钥显式留空，不调用懂鸟服务。生产隔离接入验收通过且临时数据已清理，详见 `docs/handoff/BIRD_COURSEWARE_REPAIR.md`。

2026-10-09 核查时磁盘40G、已用约23G、可用约15G；API、Nginx、PostgreSQL、Redis 正常。五个无运行文件且数据库无对应记录的旧测试服务已备份停用，未删除历史数据。2026-10-08 证书核验有效至2027-01-06，自动续签演练通过。

21:01只读验收：三个后台、七个正式课件、展示首页与五个展示代理页面均返回200，客户端TLS验证通过；健康检查数据库/Redis为up，四格故事AI/ASR/ffmpeg/drawtext配置可用。未执行真实付费生成。

2026-10-08 的旧检查点曾有配置/服务变更未执行；其后已在 22:36 重启 API 并发布新版后台和课件接入修复。2026-10-09 又增加三个正式课件及 `.mjs` MIME 修复，Nginx 已通过检查并重载。现有七个课件仍有 6 项已知部署差异，位于三个历史 slug 课件的 manifest 与页面标题/HTTPS 脚本排版；此次未修改。不能将 Git 提交一致描述成所有历史运行目录完全一致。

生效 Nginx 文件和仓库模板仍有 `listen ... http2` 与 `http2 on` 的写法差异，功能等价但不应声称字节一致。本次只增加 MIME 配置，未整份替换线上文件。`sites-available/meiyu.conf` 是未加载的旧副本，不能据此判断当前运行配置。

## 尚未完整接管的独立演示

`coursestudy.docpine.online` 在另一台服务器 `8.137.99.19`。石头剪刀布、文物修复、辩论、小精灵食豆、观鸟不属于本仓库七个正式课件。

展示目前通过 Nginx 代理旧服务器的页面和接口。旧域名证书问题尚未从源头解决，代理暂设 `proxy_ssl_verify off`，属于待消除技术债务，不代表旧服务器安全验收。必须取得有效 SSH 权限，导出源码、依赖、环境、数据库、媒体，再迁移到受控服务器；只下载网页不能算完整接管。

## 备份

服务器：`/var/backups/zhike/rebaseline-20261008/`；本地私密副本：`~/.zhike-agent-secrets/rebaseline-20261008/`。

追加发布备份：`/var/backups/zhike/birds-release-20261008-2225/`（运行目录、配置及构建产物）和 `/var/backups/zhike/birds-registration-20261009-01/`（新增课件前全量数据库、登记记录、发布包及 MIME 修复前配置）。均只用于私密运维，不进入交付包。

- `database.dump`：PostgreSQL 全量快照，350109字节，`pg_restore --list` 验证成功。
- `runtime-and-operations.tgz`：课件、作品、生产环境、配置快照，约739M，仅限私密保存。
- `inventory.json`：表计数与部署元数据。
- 五个旧测试服务的原始 unit 单独备份。

快照不持续同步。线上新增用户、成绩、作品不会自动进入本地；重新导出后独立恢复，绝不反向覆盖线上。

```bash
ssh zhike-prod
systemctl status meiyu-api nginx postgresql redis-server --no-pager
systemctl list-units 'meiyu-courseware-*' --all --no-pager
ss -lntp
nginx -t
df -h
journalctl -u meiyu-api -n 100 --no-pager
certbot certificates
```

云平台实例 ID、续费、快照和 DNS 账号仅记录在私密运维索引。主服务器仍是单点，需要异机定期备份和恢复演练。
