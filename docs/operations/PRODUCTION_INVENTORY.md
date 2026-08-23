# 生产环境清单

> 本文记录已知生产结构。每次交接和重大部署前，应按文末命令重新核对并更新“最后核对时间”。

## 公共入口

```text
阿里云 ECS 记录公网 IP：47.109.198.96
管理员与数据入口：https://data.docpine.online
教师入口：https://teacher.docpine.online
学生入口：https://student.docpine.online
健康检查：https://data.docpine.online/api/health
GitHub：https://github.com/chengdutea2023-ctrl/meiyu
```

最后公共入口核对：2026-08-23，三个页面均返回 HTTP 200；健康检查在本次改造前为 404。

最后 SSH 核对：2026-08-23。

```text
主机名：iZ2vc21mjt7g2if9474e1hZ
系统：Ubuntu 26.04 LTS x86_64
CPU：2 核
内存：约 8 GB
系统盘：40 GB，已用 21 GB（55%）
生产提交：f370f67
```

## 主机结构

当前已知形态是一台阿里云 ECS，不是 Docker/Kubernetes 生产集群：

```text
公网 -> Nginx :80/:443
          |-> 管理/教师/学生静态页面
          |-> meiyu-api.service -> Node.js :3000
                                  |-> PostgreSQL 18 127.0.0.1:5432
                                  |-> Redis 127.0.0.1:6379
                                  |-> 动态课件进程 127.0.0.1:4103/4105/4108（历史观察端口）
```

公网应仅开放 `22`、`80`、`443`。数据库、Redis、API 和课件端口不得直接暴露公网。

## 路径与服务

```text
生产代码：/opt/zhimei-education-platform/app
API 工作目录：/opt/zhimei-education-platform/app/platform/api
管理后台静态文件：/opt/zhimei-education-platform/app/apps/admin-web/dist
课件运行目录：/opt/zhimei-education-platform/courses
Nginx 配置：/etc/nginx/sites-enabled/meiyu.conf
API 服务：meiyu-api.service
```

独立课件服务名和实际端口必须以线上 `systemctl` 与 `ss` 结果为准，禁止只按本文猜测。

2026-08-23 实测 `meiyu-api`、Nginx、PostgreSQL、Redis 和 4 个动态课件服务正常；另有 5 个历史/测试课件服务处于 `auto-restart`。接管后应先确认这些服务是否仍被课程引用，再停用和归档，不能直接批量删除。

## 只读核对命令

```bash
ssh zhike-prod
systemctl status meiyu-api nginx postgresql redis-server --no-pager
systemctl list-units --type=service --state=running --no-pager
ss -lntp
nginx -t
df -h
journalctl -u meiyu-api -n 100 --no-pager
```

## 必须补齐的云端资料

阿里云实例 ID、区域、配置、安全组、磁盘、快照策略、到期时间，DNS 服务商和证书续期方式记录在私密运维包的账户索引中；真实账号和密钥不得写在本文。

## 风险

- 单 ECS 是单点故障，数据库和应用同机。
- 旧备份目录中存在 0 字节及异常小文件，不能把文件存在视为可恢复；必须新建并通过 `pg_restore --list` 验证备份。
- 2026-08-23 已生成并验证 `/var/backups/zhike/platform-handoff-20260823.dump`（335901 字节）。
- 磁盘容量、证书续期和课件健康检查需要持续验证。
- root 密钥具备整机权限，Agent 专用密钥必须可单独撤销。
