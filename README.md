# 智美教育新生态业务底座

智美教育新生态业务底座 2026。

这是一个面向教学辅助业务、课件和智能体应用的公共业务底座。

当前阶段目标：先跑通“底座统一维护教师/学生 + 第三方业务应用 SSO 接入 + 授权范围内读取用户”。

- 底座统一注册教师和学生
- 底座保存平台账号密码
- 教师注册后需要管理员审核，学生默认可用
- 管理员维护学校/机构、班级和用户归属
- 第三方业务应用不注册平台用户、不保存平台密码
- 第三方业务应用通过 SSO 获取当前用户
- 第三方业务应用凭 `appId/appSecret` 读取授权学校/班级范围内的用户
- 第三方业务应用保存自己的业务数据，并用 `platformUserId` 关联平台用户

第一阶段暂不实现支付。支付中心会作为后续阶段独立规划，统一接入微信支付和支付宝。

## 技术方向

- 后端：Node.js + TypeScript + NestJS
- 数据库：PostgreSQL
- ORM：Prisma
- 缓存/短期状态：Redis
- 管理端：React + TypeScript
- API 文档：OpenAPI / Swagger

## 目录

- `docs/`：产品、架构、接口、开发和部署文档
- `platform/`：智美教育新生态业务底座代码
- `apps/`：平台自带应用，例如管理后台
- `examples/`：示例业务应用，用于验证接入流程
- `packages/`：共享 SDK、UI 包、类型定义
- `scripts/`：开发、部署、维护脚本

## 当前代码进展

已落地第一阶段基础能力：

- NestJS API 服务：`platform/api`
- PostgreSQL 数据模型：`platform/api/prisma/schema.prisma`
- 初始化 seed：管理员、演示学校、演示班级、演示业务应用
- 学生/教师注册接口：`/api/v1/registrations/*`
- 教师审核接口：`PATCH /api/v1/users/:id/approval`
- 管理员用户、应用、学校、班级管理接口
- 业务应用授权范围接口：`/api/v1/applications/:appId/access-scope`
- 浏览器统一登录入口：`/sso/authorize`
- 授权 code 换 token：`/api/v1/auth/token`
- 当前用户上下文接口：`/api/v1/auth/me`
- 业务应用只读用户接口：`/api/v1/app-auth/users`
- 业务应用按 email 查询用户上下文：`/api/v1/app-auth/users/by-email`
- 旧用户同步接口已禁用：`/api/v1/app-auth/users/sync`
- 管理员 Web 后台：`apps/admin-web`
- 业务应用接入 SDK：`packages/sdk`
- 普通话练习第三方测试应用：`examples/mandarin-practice-app`

## 本地启动

详见：

- `docs/04-local-dev.md`

## 业务应用接入

给外部业务应用开发者的 API 接入文档：

- `docs/05-business-app-api-guide.md`

## 部署

GitHub + 阿里云 ECS 测试环境部署文档：

- `docs/06-github-aliyun-deploy.md`
