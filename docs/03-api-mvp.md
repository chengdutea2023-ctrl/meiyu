# 第一阶段 API 草案

所有接口默认前缀：

```text
/api/v1
```

Swagger 文档地址：

```text
/api/docs
```

## 登录

### POST /auth/login

使用用户名或邮箱登录平台。

请求：

```json
{
  "usernameOrEmail": "admin@example.com",
  "password": "ChangeMe123!"
}
```

返回：

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "user": {
    "id": "...",
    "username": "admin",
    "email": "admin@example.com",
    "displayName": "平台管理员",
    "isPlatformAdmin": true
  }
}
```

## 浏览器统一登录入口

### GET /sso/authorize

业务应用应把未登录用户重定向到这个地址。

查询参数：

```text
appId=demo-teaching-app
redirectUri=http://localhost:3001/auth/callback
state=demo-state
scope=profile organization class
```

如果用户还没有底座登录态，底座会展示统一登录页。登录成功后，底座会回跳业务应用：

```text
http://localhost:3001/auth/callback?code=...&state=demo-state
```

业务应用服务端随后调用 `POST /api/v1/auth/token` 使用 `code + appSecret` 换取 token。

## API 授权接口

### GET /auth/authorize

为已登录用户生成一次性授权 code。这个接口主要用于内部或 SDK 场景；浏览器业务应用优先使用 `/sso/authorize`。

请求头：

```text
Authorization: Bearer <platform_access_token>
```

查询参数：

```text
appId=demo-teaching-app
redirectUri=http://localhost:3001/auth/callback
state=opaque-state
```

返回：

```json
{
  "redirectTo": "http://localhost:3001/auth/callback?code=...&state=opaque-state",
  "expiresIn": 120
}
```

### POST /auth/token

业务应用服务端使用 code 换 token。

请求：

```json
{
  "appId": "demo-teaching-app",
  "appSecret": "demo-app-secret",
  "code": "...",
  "redirectUri": "http://localhost:3001/auth/callback"
}
```

返回：

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "user": {
    "id": "...",
    "username": "admin",
    "email": "admin@example.com",
    "displayName": "平台管理员",
    "isPlatformAdmin": true
  }
}
```

## 当前用户上下文

### GET /auth/me

请求头：

```text
Authorization: Bearer <access_token>
```

返回当前用户、机构、班级和 token 面向的平台/业务应用上下文。

## 管理接口

以下接口需要平台管理员 token：

```text
POST /users
GET /users
GET /users/:id
PATCH /users/:id/status

POST /applications
GET /applications
GET /applications/:appId
PATCH /applications/:appId/status

POST /organizations
GET /organizations
GET /organizations/:id
POST /organizations/:id/classes
POST /organizations/:id/members
POST /organizations/classes/:classId/members
```
