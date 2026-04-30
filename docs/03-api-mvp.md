# 第一阶段 API 草案

本草案按新的业务逻辑调整：业务应用自己注册、自己登录、自己保存密码；业务底座不保存业务用户密码，只负责应用授权、用户同步、email 归并和 `platformUserId` 分配。

所有接口默认前缀：

```text
/api/v1
```

Swagger 文档地址：

```text
/api/docs
```

## 平台管理员登录

### POST /auth/login

使用用户名或邮箱登录平台后台。这个接口面向平台管理员，不是业务应用普通用户登录入口。

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

## 业务应用服务端认证

业务应用调用底座的用户同步接口时，使用应用凭证认证。

推荐请求头：

```text
X-App-Id: demo-teaching-app
X-App-Secret: demo-app-secret
Content-Type: application/json
```

`appSecret` 只能放在业务应用服务端，不能放在前端。

## 用户同步接口

### POST /app-auth/users/sync

业务应用在用户注册成功、登录成功或用户资料变更后调用。底座按 email 查找或创建平台用户，并建立业务应用本地用户和平台用户的绑定关系。

请求头：

```text
X-App-Id: demo-teaching-app
X-App-Secret: demo-app-secret
```

请求：

```json
{
  "email": "teacher@example.com",
  "externalUserId": "a_10001",
  "username": "teacher01",
  "displayName": "张老师",
  "emailVerified": true
}
```

返回：

```json
{
  "platformUserId": "u_abc123",
  "email": "teacher@example.com",
  "created": false,
  "linked": true,
  "sourceAppId": "demo-teaching-app",
  "applicationUser": {
    "appId": "demo-teaching-app",
    "externalUserId": "a_10001",
    "firstLinkedAt": "2026-04-30T00:00:00.000Z",
    "lastSyncedAt": "2026-04-30T00:00:00.000Z"
  }
}
```

### GET /app-auth/users/by-email

业务应用按 email 查询平台用户上下文。

请求头：

```text
X-App-Id: demo-teaching-app
X-App-Secret: demo-app-secret
```

查询参数：

```text
email=teacher@example.com
```

返回：

```json
{
  "platformUserId": "u_abc123",
  "email": "teacher@example.com",
  "username": "teacher01",
  "displayName": "张老师",
  "sourceAppId": "demo-teaching-app",
  "organizations": [],
  "classes": []
}
```

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

## 统一登录 SSO 可选接口

以下接口是当前已有 SSO 能力，可保留给需要统一登录页的业务应用。但第一阶段主线接入方式是 `/app-auth/users/sync`。

### GET /sso/authorize

浏览器统一登录入口。

### GET /auth/authorize

为已登录用户生成一次性授权 code。

### POST /auth/token

业务应用服务端使用 code 换 token。

### GET /auth/me

使用 bearer token 获取当前用户上下文。
