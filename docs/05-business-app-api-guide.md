# 智美教育新生态业务底座业务应用接入文档

本文档面向接入智美教育新生态业务底座的第三方课件、智能体或教学应用开发者。

当前架构已经调整为：教师和学生账号由业务底座统一注册、保存密码、审核和维护学校班级归属；第三方业务应用不再注册教师/学生，也不再同步创建平台用户。第三方应用只负责自己的业务内容和业务数据，通过 SSO 获取当前登录用户，通过服务端 API 读取授权范围内的平台用户。

## 1. 职责边界

业务底座负责：

- 学生注册、教师注册、平台管理员创建用户
- 教师审核，学生默认可用
- 用户邮箱、密码、身份类型、年龄段
- 学校/机构、班级、用户归属
- 业务应用登记、appId/appSecret、SSO 回调地址
- 配置每个业务应用可读取的学校/班级范围

第三方业务应用负责：

- 自己的页面、课件、智能体和业务流程
- 自己的业务数据库，例如练习记录、绘画记录、测评记录
- 通过底座 SSO 登录用户，不保存用户密码
- 在服务端保存 `platformUserId`，作为业务数据和平台用户的关联键

第三方业务应用不能做：

- 在自己的系统里注册教师或学生
- 保存教师/学生平台密码
- 调用旧的用户同步接口创建平台用户
- 读取未授权学校/班级的用户

## 2. 地址

线上测试环境：

```text
后台管理：http://meiyu.cdbbox.com
API Base URL：http://meiyu.cdbbox.com/api/v1
Swagger：http://meiyu.cdbbox.com/api/docs
```

本地开发环境：

```text
后台管理：http://localhost:5173
API Base URL：http://localhost:3000/api/v1
Swagger：http://localhost:3000/api/docs
```

## 3. 接入前准备

平台管理员需要先在后台完成：

1. 登记业务应用，生成 `appId` 和一次性显示的 `appSecret`。
2. 配置业务应用首页 `homeUrl`。
3. 配置 SSO 回调地址 `redirectUris`，例如 `https://your-app.com/auth/callback`。
4. 配置允许调用域名 `allowedOrigins`。
5. 配置该应用可读取的学校/机构和班级范围。

开发者需要安全保存：

```text
PLATFORM_PUBLIC_URL=https://meiyu.cdbbox.com
APP_ID=your-app-id
APP_SECRET=your-app-secret
APP_PUBLIC_URL=https://your-app.com
```

`appSecret` 只能放在服务端环境变量里，不能放入前端代码、浏览器、移动端包或公开仓库。

## 4. 用户字段

第三方应用可以拿到的统一用户字段：

| 字段 | 说明 |
| --- | --- |
| `platformUserId` | 底座统一用户 ID，第三方业务数据应保存这个字段 |
| `email` | 全平台唯一邮箱 |
| `username` | 用户名，可为空 |
| `displayName` | 显示名称/姓名 |
| `userType` | `STUDENT`、`TEACHER`、`ADMIN` |
| `approvalStatus` | `APPROVED`、`PENDING`、`REJECTED` |
| `ageBand` | 学生年龄段，可为空 |
| `organizations` | 用户所属学校/机构 |
| `classes` | 用户所属班级 |

第三方应用本地业务表建议保存：

```text
platform_user_id
email
display_name
user_type
age_band
business_data...
created_at
updated_at
```

不要保存平台密码。

## 5. 推荐登录流程：SSO

第三方应用应把用户引导到业务底座统一登录页。

浏览器跳转：

```text
GET /sso/authorize?appId=your-app-id&redirectUri=https://your-app.com/auth/callback&state=random-state
```

完整线上示例：

```text
https://meiyu.cdbbox.com/sso/authorize?appId=your-app-id&redirectUri=https%3A%2F%2Fyour-app.com%2Fauth%2Fcallback&state=random-state
```

用户在底座登录。若没有账号，可以在底座登录页进入学生注册或教师入驻申请：

- 学生注册后可直接登录，学校/班级由管理员稍后分配。
- 教师注册后进入待审核，管理员审核通过后才能登录。

底座登录成功后，会跳回第三方应用回调地址：

```text
https://your-app.com/auth/callback?code=one-time-code&state=random-state
```

第三方应用服务端使用 `code + appSecret` 换取 token。

```http
POST /api/v1/auth/token
Content-Type: application/json

{
  "appId": "your-app-id",
  "appSecret": "your-app-secret",
  "code": "one-time-code",
  "redirectUri": "https://your-app.com/auth/callback"
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
    "id": "platform_user_id",
    "username": "student@example.com",
    "email": "student@example.com",
    "displayName": "学生姓名",
    "userType": "STUDENT",
    "approvalStatus": "APPROVED",
    "ageBand": "6-12岁",
    "isPlatformAdmin": false
  }
}
```

之后用 `accessToken` 读取当前用户上下文：

```http
GET /api/v1/auth/me
Authorization: Bearer access_token
```

返回会包含 `user`、`organizations`、`classes`。未分配班级的学生可以登录，`classes` 返回空数组。

## 6. 服务端只读接口

第三方应用服务端可以凭应用凭证读取授权范围内的平台用户。

请求头：

```text
X-App-Id: your-app-id
X-App-Secret: your-app-secret
```

### GET /app-auth/users

读取当前应用授权范围内的已审核用户。

查询参数：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `userType` | 否 | `STUDENT`、`TEACHER`、`ADMIN` |
| `organizationId` | 否 | 按学校/机构筛选 |
| `classId` | 否 | 按班级筛选 |
| `limit` | 否 | 1-200，默认 100 |

示例：

```http
GET /api/v1/app-auth/users?userType=STUDENT&limit=100
X-App-Id: your-app-id
X-App-Secret: your-app-secret
```

返回：

```json
{
  "users": [
    {
      "platformUserId": "platform_user_id",
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

按邮箱读取授权范围内的单个用户。

```http
GET /api/v1/app-auth/users/by-email?email=student@example.com
X-App-Id: your-app-id
X-App-Secret: your-app-secret
```

如果该用户不存在、未审核、被禁用，或者不在该应用授权范围内，会返回 `404`。

## 7. 已禁用接口

旧接口仍保留路径，但已经禁用：

```text
POST /api/v1/app-auth/users/sync
```

该接口会返回 `403 Third-party user sync is disabled`。

第三方应用不要再调用它。用户注册、密码和学校班级归属全部回到底座处理。

## 8. 注册接口说明

底座提供注册接口和 SSO 页面使用：

```text
POST /api/v1/registrations/students
POST /api/v1/registrations/teachers
```

这些接口属于业务底座自己的注册能力，不作为第三方应用的用户同步接口。第三方应用应跳转到底座 SSO 页面，让用户在底座完成注册或登录。

## 9. Node.js 最小 SSO 示例

```js
app.get('/auth/start', (req, res) => {
  const url = new URL('/sso/authorize', process.env.PLATFORM_PUBLIC_URL);
  url.searchParams.set('appId', process.env.APP_ID);
  url.searchParams.set('redirectUri', `${process.env.APP_PUBLIC_URL}/auth/callback`);
  url.searchParams.set('state', crypto.randomUUID());
  res.redirect(url.toString());
});

app.get('/auth/callback', async (req, res) => {
  const tokenResponse = await fetch(`${process.env.PLATFORM_PUBLIC_URL}/api/v1/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      appId: process.env.APP_ID,
      appSecret: process.env.APP_SECRET,
      code: req.query.code,
      redirectUri: `${process.env.APP_PUBLIC_URL}/auth/callback`,
    }),
  });

  const token = await tokenResponse.json();
  const contextResponse = await fetch(`${process.env.PLATFORM_PUBLIC_URL}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token.accessToken}` },
  });
  const context = await contextResponse.json();

  await saveBusinessSession({
    platformUserId: context.user.id,
    email: context.user.email,
    displayName: context.user.displayName,
    userType: context.user.userType,
    ageBand: context.user.ageBand,
    organizations: context.organizations,
    classes: context.classes,
  });

  res.redirect('/dashboard');
});
```

## 10. 联调检查清单

平台管理员需要确认：

- 已创建业务应用，并把 `appId/appSecret` 安全交给开发者。
- 已配置正式 `redirectUris`。
- 已配置该应用可读取的学校/班级范围。
- 已创建或审核教师/学生账号。
- 已把学生分配到学校/班级；未分配学生仍可登录，但班级数组为空。

第三方开发者需要确认：

- 登录入口跳转到底座 `/sso/authorize`。
- 回调服务端使用 `code + appSecret` 换 token。
- 本地业务数据保存 `platformUserId`。
- 不保存平台密码，不调用 `/app-auth/users/sync`。
- 服务端只在需要名单时调用 `/app-auth/users` 或 `/app-auth/users/by-email`。
