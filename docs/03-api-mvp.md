# 第一阶段 API 草案

本草案按最新业务逻辑调整：业务底座统一负责教师和学生注册、密码、审核、学校/班级归属；第三方业务应用通过 SSO 登录接入，只读取授权范围内的平台用户，不再同步创建平台用户。

核心规则：注册发生在业务底座，第三方应用通过 SSO token 和只读 API 接收底座用户数据。

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

用于平台后台管理员登录，也可用于底座用户的账号密码登录。

请求：

```json
{
  "usernameOrEmail": "admin@example.com",
  "password": "ChangeMe123!"
}
```

返回用户字段包含：

```json
{
  "id": "...",
  "username": "admin",
  "email": "admin@example.com",
  "displayName": "平台管理员",
  "userType": "ADMIN",
  "approvalStatus": "APPROVED",
  "ageBand": null,
  "isPlatformAdmin": true
}
```

## 底座注册接口

### POST /registrations/students

学生公开注册。学生注册后默认 `APPROVED`，学校和班级由后台管理员后续分配。第三方应用不应自行注册学生；如需要学生注册，应把用户引导到底座注册页。

```json
{
  "email": "student@example.com",
  "password": "ChangeMe123!",
  "displayName": "学生姓名",
  "ageBand": "6-12岁"
}
```

### POST /registrations/teachers

教师公开注册。教师注册后默认 `PENDING`，必须由后台管理员审核为 `APPROVED` 后才能登录。第三方应用不应自行注册教师。

```json
{
  "email": "teacher@example.com",
  "password": "ChangeMe123!",
  "displayName": "老师姓名"
}
```

## 统一登录 SSO

### GET /sso/authorize

浏览器统一登录入口。第三方应用应把用户跳转到这里。

```text
/sso/authorize?appId=mandarin-practice-app&redirectUri=http://localhost:3101/auth/callback&state=random-state
```

如果用户未登录，底座展示登录页。登录页提供学生注册和教师入驻申请入口。学生注册成功后先显示成功页，再继续进入第三方应用；教师注册后等待管理员审核。

### POST /auth/token

业务应用服务端使用授权 `code + appSecret` 换取用户 token。token 响应包含当前用户基础资料，是第三方应用接收注册/登录用户数据的主要方式。

```json
{
  "appId": "mandarin-practice-app",
  "appSecret": "mandarin-practice-secret",
  "code": "one-time-code",
  "redirectUri": "http://localhost:3101/auth/callback"
}
```

### GET /auth/me

使用 bearer token 获取当前用户上下文。

返回包含：

```text
user
audience
appId
organizations
classes
```

未分配学校/班级的学生仍可进入业务应用，`organizations` 或 `classes` 为空数组。

## 业务应用服务端认证

业务应用调用只读接口时，使用应用凭证认证。

```text
X-App-Id: mandarin-practice-app
X-App-Secret: mandarin-practice-secret
Content-Type: application/json
```

`appSecret` 只能放在业务应用服务端。

## 业务应用只读接口

### GET /app-auth/users

业务应用读取授权学校/班级范围内的已审核用户。第三方应用可以用它把底座中的学生、教师数据拉取到自己的业务数据库中，作为本地用户快照。

查询参数：

```text
userType=STUDENT | TEACHER | ADMIN
organizationId=...
classId=...
limit=100
```

返回：

```json
{
  "users": [
    {
      "platformUserId": "...",
      "email": "student@example.com",
      "username": null,
      "displayName": "学生姓名",
      "userType": "STUDENT",
      "ageBand": "6-12岁",
      "organizations": [],
      "classes": []
    }
  ]
}
```

### GET /app-auth/users/by-email

业务应用按邮箱查询授权范围内的单个用户上下文。

```text
GET /app-auth/users/by-email?email=student@example.com
```

如果用户不存在、未审核、被禁用，或不在该应用授权范围内，返回 `404`。

## 已禁用接口

### POST /app-auth/users/sync

该接口已经禁用。第三方业务应用不再允许同步创建或更新平台用户。旧的“第三方注册后同步到底座”模式已经废弃。

```text
403 Third-party user sync is disabled
```

## 管理接口

以下接口需要平台管理员 token：

```text
POST /users
GET /users
GET /users/:id
PATCH /users/:id/status
PATCH /users/:id/approval

POST /applications
GET /applications
GET /applications/:appId
GET /applications/:appId/users
GET /applications/:appId/access-scope
PATCH /applications/:appId/access-scope
PATCH /applications/:appId/status

POST /organizations
GET /organizations
GET /organizations/:id
POST /organizations/:id/classes
POST /organizations/:id/members
POST /organizations/classes/:classId/members
```

## 关键规则

- `email` 仍是全平台唯一身份字段。
- `platformUserId` 是第三方应用保存业务数据时的统一关联键。
- 教师 `PENDING` 或 `REJECTED` 时不能登录第三方应用。
- 第三方应用只能读取后台授权范围内的学校/班级用户。
- 第三方应用不保存平台密码，不调用旧同步接口。
- 当前阶段不提供 webhook 主动推送；第三方通过 SSO 回调和 app-auth 只读接口获取注册后的用户数据。
