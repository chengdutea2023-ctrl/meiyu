# 智课项目概览

## 项目定位

智课是面向学校的 AI 教学业务底座。平台统一管理管理员、教师、学生、学校、班级、课程、课件和学习记录；互动课件通过统一启动上下文和 API 接入，不重复建设账号体系。

## 唯一代码基线

```text
本地主目录：/Users/zeng/工作/代码块/meiyu
GitHub：https://github.com/chengdutea2023-ctrl/meiyu
主分支：main
生产目录：/opt/zhimei-education-platform/app
```

不得把服务器运行目录、旧副本或验收压缩包反向覆盖本地主仓库。

## 技术组成

- npm workspaces 单仓库
- NestJS 11 API，位于 `platform/api`
- Prisma 5 + PostgreSQL
- Redis 作为运行依赖和后续短期状态基础设施
- Vite 管理后台，位于 `apps/admin-web`
- Nginx + systemd 生产部署
- 课件源码位于 `coursewares/`，运行类型为 `STATIC`、`NODE` 或 `BOTH`

## 业务边界

- 底座保存账号、组织、课程、课件和学习记录。
- 第三方应用通过 SSO 和服务端只读接口接入，以 `platformUserId` 关联业务数据。
- 课件通过 `launchToken`、`platformApiBase`、`returnUrl` 获取启动上下文和上报成绩。
- 学生作品、图片、音频和运行数据必须进入独立数据目录，不进入源码包。

## 开发流程

```text
创建功能分支 -> 本地开发 -> agent:check -> 提交 -> 推送 -> 生产预检 -> 备份 -> 快进发布 -> 验收
```

生产发布和服务器操作参见 `docs/operations/DEPLOY_RUNBOOK.md`。
