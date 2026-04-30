# 智美教育新生态业务底座

智美教育新生态业务底座 2026。

这是一个面向教学辅助业务的智美教育新生态业务底座项目。

第一阶段目标是先跑通业务应用接入和用户同步：

- 业务应用自己注册、自己登录、自己保存密码
- 底座使用 email 建立统一用户索引
- 底座返回统一 `platformUserId`
- 业务应用登记：`appId`、`appSecret`、入口地址、允许调用域名
- 业务应用服务端通过 API 同步用户
- 当前用户 / 组织 / 班级上下文 API
- 基础组织、班级、角色模型
- 管理员后台雏形

第一阶段暂不实现支付。支付中心会作为后续阶段独立规划，统一接入微信支付和支付宝。

## 技术方向

- 后端：Node.js + TypeScript + NestJS
- 数据库：PostgreSQL
- ORM：Prisma
- 缓存/短期状态：Redis
- 管理端：React + TypeScript
- API 文档：OpenAPI / Swagger

## 目录

- `docs/`：产品、架构、接口、开发规范文档
- `platform/`：智美教育新生态业务底座代码
- `apps/`：平台自带应用，例如管理后台
- `examples/`：示例业务应用，用于验证接入流程
- `packages/`：共享 SDK、UI 包、类型定义
- `scripts/`：开发、部署、维护脚本

## 当前代码进展

已落地第一阶段后端基础：

- NestJS API 服务：`platform/api`
- PostgreSQL 数据模型：`platform/api/prisma/schema.prisma`
- 初始化 seed：管理员、演示学校、演示班级、演示业务应用
- 平台管理员登录接口
- 业务应用用户同步接口：`/api/v1/app-auth/users/sync`
- 业务应用按 email 查询平台用户上下文接口：`/api/v1/app-auth/users/by-email`
- 统一登录 SSO 接口，作为可选能力保留
- 业务应用授权 code 接口，作为可选能力保留
- code 换 token 接口，作为可选能力保留
- 当前用户上下文接口
- 浏览器统一登录入口：`/sso/authorize`，作为可选能力保留
- 管理员用户管理接口
- 管理员业务应用管理接口
- 管理员机构和班级管理接口
- 管理员 Web 后台：`apps/admin-web`
- 业务应用接入 SDK：`packages/sdk`
- 独立示例业务应用：`examples/teaching-demo-app`

## 本地启动

详见：

- `docs/04-local-dev.md`

## 业务应用接入

给外部业务应用开发者的 API 接入文档：

- `docs/05-business-app-api-guide.md`

## 部署

GitHub + 阿里云 ECS 测试环境部署文档：

- `docs/06-github-aliyun-deploy.md`
