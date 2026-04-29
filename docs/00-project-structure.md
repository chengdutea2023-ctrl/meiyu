# 项目目录约定

## 根目录

```text
.
├── docs/
├── platform/
├── apps/
├── examples/
├── packages/
└── scripts/
```

## docs

存放项目文档，包括：

- 项目目标
- MVP 范围
- 架构设计
- 登录接入流程
- 数据模型
- API 设计
- 部署方案
- 支付中心后续规划

## platform

智美教育新生态业务底座主服务，后续会包含：

- 统一认证服务
- 用户服务
- 组织与班级服务
- 业务应用接入服务
- 管理后台 API
- OpenAPI 文档

## apps

平台自带应用。第一阶段预计包含：

- `admin-web`：管理员后台

## examples

示例业务应用，用于验证第三方业务应用如何接入底座。

第一阶段建议至少保留一个示例：

- `teaching-demo-app`：模拟一个独立教学辅助业务应用

## packages

共享包目录。后续预计包含：

- `sdk`：业务应用接入 SDK
- `ui`：统一 UI 组件和设计变量
- `types`：共享 TypeScript 类型

## scripts

开发、数据库、部署相关脚本。

