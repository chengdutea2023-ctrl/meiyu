# 本地开发

说明：当前主线是“业务应用自有注册登录 + 底座用户同步 API”。代码里仍保留了 SSO 示例流程，下面把两种本地验证方式都列出来。

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
SSO 回调地址：http://localhost:3001/auth/callback
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

当前 SSO 示例浏览器流程：

```text
http://localhost:3001
  -> /login
  -> http://localhost:3000/sso/authorize
  -> 底座统一登录页
  -> http://localhost:3001/auth/callback
  -> /me
```

## 当前 SSO 手工验证

1. 调用 `POST /api/v1/auth/login` 获取平台 access token。
2. 使用平台 token 调用 `GET /api/v1/auth/authorize` 生成 `redirectTo`。
3. 从 `redirectTo` 中复制 `code`。
4. 调用 `POST /api/v1/auth/token` 换取业务应用 token。
5. 使用业务应用 token 调用 `GET /api/v1/auth/me` 获取当前用户上下文。

也可以直接使用示例业务应用完成浏览器验证。

## 启动普通话练习第三方测试应用

普通话练习应用用于验证“第三方系统自有注册登录 + 调用底座同步用户”的主线流程。它使用自己的本地数据库文件，不使用底座数据库保存密码或练习记录。

先确保 seed 已创建测试应用：

```text
appId：mandarin-practice-app
appSecret：mandarin-practice-secret
地址：http://localhost:3101
本地数据库：examples/mandarin-practice-app/data/mandarin-practice-db.json
```

启动：

```bash
npm run dev:mandarin
```

访问：

```text
http://localhost:3101
```

验证流程：

```text
1. 在普通话练习应用注册用户。
2. 普通话练习应用自己保存 email、密码哈希和练习记录。
3. 注册或登录成功后，应用服务端调用 /api/v1/app-auth/users/sync。
4. 页面显示底座返回的 platformUserId。
5. 完成练习后，练习记录保存在普通话应用自己的数据库文件。
```

## 新主线接口验证

新主线接口是业务应用服务端调用底座同步用户：

```text
POST /api/v1/app-auth/users/sync
GET /api/v1/app-auth/users/by-email
```

本地 curl 示例：

```bash
curl -X POST http://localhost:3000/api/v1/app-auth/users/sync \
  -H "Content-Type: application/json" \
  -H "X-App-Id: demo-teaching-app" \
  -H "X-App-Secret: demo-app-secret" \
  -d '{
    "email": "teacher@example.com",
    "externalUserId": "a_10001",
    "username": "teacher01",
    "displayName": "张老师",
    "emailVerified": true
  }'
```

查询已绑定的平台用户上下文：

```bash
curl "http://localhost:3000/api/v1/app-auth/users/by-email?email=teacher@example.com" \
  -H "X-App-Id: demo-teaching-app" \
  -H "X-App-Secret: demo-app-secret"
```
