# 本地开发

## 前置依赖

- Node.js 20+
- npm
- Docker Desktop，或本地 PostgreSQL / Redis

## 安装依赖

```bash
npm install
```

## 启动 PostgreSQL 和 Redis

```bash
docker compose up -d postgres redis
```

## 配置环境变量

```bash
cp platform/api/.env.example platform/api/.env
```

默认数据库连接：

```text
postgresql://jiaoxue:jiaoxue_password@localhost:5432/jiaoxue_platform?schema=public
```

## 初始化数据库

```bash
npm run prisma:generate
npm run db:migrate
npm run db:seed
```

seed 默认会创建：

```text
管理员：admin@example.com / ChangeMe123!
演示应用：demo-teaching-app / demo-app-secret
回调地址：http://localhost:3001/auth/callback
```

## 启动 API

```bash
npm run dev:api
```

API 地址：

```text
http://localhost:3000/api/v1
```

Swagger 地址：

```text
http://localhost:3000/api/docs
```

## 启动后台管理页面

另开一个终端：

```bash
npm run dev:admin
```

后台管理页面地址：

```text
http://localhost:5173
```

默认管理员账号：

```text
admin@example.com / ChangeMe123!
```

## 启动示例业务应用

另开一个终端：

```bash
npm run dev:demo
```

示例应用地址：

```text
http://localhost:3001
```

完整浏览器流程：

```text
http://localhost:3001
  -> /login
  -> http://localhost:3000/sso/authorize
  -> 底座统一登录页
  -> http://localhost:3001/auth/callback
  -> /me
```

## 第一轮手工验证

1. 调用 `POST /api/v1/auth/login` 获取平台 access token。
2. 使用平台 token 调用 `GET /api/v1/auth/authorize` 生成 `redirectTo`。
3. 从 `redirectTo` 中复制 `code`。
4. 调用 `POST /api/v1/auth/token` 换取业务应用 token。
5. 使用业务应用 token 调用 `GET /api/v1/auth/me` 获取当前用户上下文。

也可以直接使用示例业务应用完成浏览器验证。
