# 凭据索引

本文只记录凭据类别和保管规则，不保存真实值。

本机私密目录：`~/.zhike-agent-secrets/`。该目录权限必须为 `700`，文件权限必须为 `600`，不得位于项目、Git、iCloud 或其他同步盘中。

| 凭据 | 用途 | 建议位置 | 轮换时机 |
| --- | --- | --- | --- |
| Agent root SSH 私钥 | 登录生产 ECS | `ssh/id_ed25519_zhike_agent` | Agent 更换、人员离开或疑似泄露 |
| SSH 主机配置 | `ssh zhike-prod` | `ssh/config` | IP、用户名或密钥变化 |
| 生产环境变量备份 | API、数据库、JWT | `env/platform-api.production.env` | 发布配置变化或密钥轮换 |
| 数据库凭据 | PostgreSQL 管理与备份 | 生产 env / 密码库 | 疑似泄露或定期轮换 |
| AI 服务凭据 | 文本、图片生成 | 生产 env / 密码库 | 供应商轮换或疑似泄露 |
| 懂鸟 API 凭据 | 观鸟课件图像识别 | 生产 `shared/birdai.env`，root/600；观鸟服务 drop-in 加载 | 用户决定或供应商停用；不得在索引记录真实值 |
| 观鸟三活动测试账号 | 三角色线上功能验收；管理员为全平台权限 | 本机 `bird-courseware-testing-20261011/`；生产 `shared/testing/birds-20261011/` | 测试结束后停用或重置；不进入 Git 和交付包 |
| GitHub 凭据 | 拉取与推送代码 | 系统 Keychain 或独立 SSH key | Agent 更换或权限变化 |
| 阿里云账户索引 | 实例、续费、快照 | `accounts/aliyun.md` | 实例或账户变化 |
| DNS/证书账户索引 | 域名和 HTTPS | `accounts/dns.md` | 服务商或证书变化 |

## 禁止事项

- 不把真实值写入本文件、`AGENTS.md`、Agent 提示词、提交信息或工单。
- 不让 Agent 使用 `cat`、调试输出或错误上报打印完整 env 和私钥。
- 不共享个人长期 SSH 私钥；使用可单独撤销的 Agent 专用密钥。
- 阿里云主账号和付款能力由项目负责人掌握，不交给自动化 Agent。
