# 智课项目 Agent 接管入口

本文件适用于 Claude Code、Cursor、Trae、Windsurf 及其他能够读取本地仓库和运行终端命令的编程 Agent。任何工具专用规则都只能引用本文件和 `docs/`，不得另建互相冲突的业务规范。

## 开始工作前

1. 阅读 `docs/handoff/PROJECT_OVERVIEW.md`、`docs/handoff/LOCAL_DEVELOPMENT.md` 和 `docs/operations/PRODUCTION_INVENTORY.md`。
   最近重整记录：`docs/operations/BASELINE_20261008.md`。源码一致、数据库快照、外部演示服务是三个不同验收范围，不得混称全部同步。
2. 首次克隆先运行 `npm ci` 和 `npm run prisma:generate`，再运行 `npm run agent:doctor`，确认 Node.js、依赖、环境文件、Git 状态和课件清单。
3. 查看 `git status --short --branch`，不得覆盖或撤销已有未提交内容。
4. 功能开发使用独立分支；`main` 对应线上基线。
5. 涉及课件开发、修复、验收或打包时，优先使用 `skills/zhike-courseware-integration/`；不支持 Skill 的 Agent 必须直接读取其中的 `SKILL.md` 和 v3 白皮书。

## 不可违反的规则

- 本地开发优先，线上服务器只运行经过提交和验证的 Git 版本。
- 不把 `.env`、SSH 密钥、密码、学生数据、生成作品、日志或 PID 文件提交到 Git。
- 不在回复、命令输出、提交信息或文档中打印生产凭据。
- 课件不得保存底座密码、直连平台数据库、绕过 `launchToken`，或另建学生登录体系。
- 发布前依次运行 `npm run agent:check` 和 `npm run deploy:preflight`。
- 发布、数据库迁移、恢复和删除操作必须先说明影响与回滚点；生产更新只允许快进到已验证提交。
- 不直接把本地目录覆盖到生产服务器，不在生产目录临时改源码。

## 主要入口

- 本地开发：`docs/handoff/LOCAL_DEVELOPMENT.md`
- 课件目录：`docs/handoff/COURSEWARE_CATALOG.md`
- 线上结构：`docs/operations/PRODUCTION_INVENTORY.md`
- 发布与回滚：`docs/operations/DEPLOY_RUNBOOK.md`
- 故障处理：`docs/operations/INCIDENT_RUNBOOK.md`
- 凭据索引：`docs/operations/SECRETS_INDEX.md`
- 安全升级清单：`docs/operations/SECURITY_BACKLOG.md`
- 课件接入主契约：`docs/16-zhike-courseware-integration-whitepaper-v3.md`
- 课件开发 Skill：`skills/zhike-courseware-integration/`
- 底层实现参考：`docs/09-course-runtime-deployment.md`、`docs/10-courseware-development-standard.md`

## 验收命令

```bash
npm run agent:check
npm run coursewares:package
```

正式发布包必须来自干净的 Git 提交，文件名和 `release-manifest.json` 不得包含 `dirty`。
