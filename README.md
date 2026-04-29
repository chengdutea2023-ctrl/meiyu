# 智美教育新生态业务底座

这是一个面向教学辅助业务的智美教育新生态业务底座项目。

第一阶段目标是先跑通统一登录和独立业务应用接入：

- 统一用户账号：用户名、邮箱、密码
- 统一登录页
- 业务应用登记：`appId`、`appSecret`、回调地址、入口地址
- 类 OAuth2 Authorization Code 的登录接入流程
- 当前用户 API
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
- 统一登录接口
- 业务应用授权 code 接口
- code 换 token 接口
- 当前用户上下文接口
- 浏览器统一登录入口：`/sso/authorize`
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
