# 智美教育新生态业务底座业务应用接入文档

本文档面向接入智美教育新生态业务底座的业务应用开发者。

当前确认的业务逻辑是：业务应用自己负责注册、登录和密码保存；业务底座不提供统一注册地址，也不保存业务用户密码。业务底座负责统一用户索引、应用授权、跨应用用户关联、组织班级上下文和后续统一支付能力。

## 1. 核心原则

```text
业务应用负责：
- 自己的网站入口
- 自己的注册页面
- 自己的登录页面
- 自己保存用户密码
- 自己校验账号密码
- 自己维护业务数据

业务底座负责：
- 登记业务应用
- 给业务应用分配 appId / appSecret
- 接收业务应用同步过来的用户
- 使用 email 生成或查找统一 platformUserId
- 记录业务应用本地用户和平台用户的绑定关系
- 给业务应用返回平台用户身份和上下文
```

第一阶段不要求用户跳转到业务底座统一登录页。统一登录 SSO 可以作为后续可选能力保留，但不是当前主接入方式。

## 2. 平台地址

测试环境：

```text
平台首页 / 后台管理：http://meiyu.cdbbox.com
平台 API Base URL：http://meiyu.cdbbox.com/api/v1
Swagger API 文档：http://meiyu.cdbbox.com/api/docs
```

本地开发环境：

```text
平台 API Base URL：http://localhost:3000/api/v1
Swagger API 文档：http://localhost:3000/api/docs
```

## 3. 接入前需要申请的信息

每个业务应用需要先由平台管理员在后台登记。登记后会获得：

```text
appId：业务应用公开标识
appSecret：业务应用服务端密钥
homeUrl：业务应用首页地址
allowedOrigins：允许调用接口的业务应用域名
```

注意：

- `appId` 可以出现在日志和服务端配置里。
- `appSecret` 只能保存在业务应用服务端，不能放到前端代码、浏览器、移动端包或公开仓库里。
- 每个业务应用只能同步自己应用内真实存在的用户。

## 4. 用户唯一规则

全平台统一使用 `email` 作为用户唯一标识。

规则：

```text
1. A 应用注册用户 teacher@example.com。
2. A 应用保存自己的密码和本地 userId。
3. A 应用调用底座 API 同步用户。
4. 底座发现 email 不存在，创建平台用户并生成 platformUserId。
5. B 应用以后也同步 teacher@example.com。
6. 底座发现 email 已存在，返回同一个 platformUserId，并建立 B 应用本地用户绑定。
```

示例：

```text
A 应用本地用户：
externalUserId = a_10001
email = teacher@example.com

B 应用本地用户：
externalUserId = b_20001
email = teacher@example.com

底座统一用户：
platformUserId = u_abc123
email = teacher@example.com

绑定关系：
app_a / a_10001 -> u_abc123
app_b / b_20001 -> u_abc123
```

这表示 A 应用和 B 应用中的这个邮箱用户被视为同一个平台用户。

## 5. 密码和登录规则

业务底座不保存业务用户密码。

业务应用登录流程：

```text
1. 用户访问 A 应用。
2. 用户在 A 应用注册或登录。
3. A 应用使用自己的数据库校验邮箱和密码。
4. 校验成功后，A 应用服务端调用底座用户同步接口。
5. 底座返回 platformUserId 和用户上下文。
6. A 应用把 platformUserId 保存到自己的用户表或 session 中。
```

底座只保存：

```text
email
platformUserId
displayName
sourceAppId
应用本地 externalUserId 绑定关系
组织 / 班级 / 权限上下文
```

底座不保存：

```text
业务用户密码
业务应用本地登录 session
业务应用自己的业务数据
```

平台管理员账号是例外。平台管理员用于登录后台管理系统，可以由底座保存密码。

## 6. 应用服务端认证

业务应用调用底座 API 时，必须从服务端发起请求，并携带应用凭证。

推荐请求头：

```text
X-App-Id: your-app-id
X-App-Secret: your-app-secret
Content-Type: application/json
```

不要从浏览器直接调用这些接口，因为浏览器会暴露 `appSecret`。

## 7. 用户同步接口

目标接口：

```text
POST /api/v1/app-auth/users/sync
```

用途：

```text
业务应用在用户注册成功、登录成功或用户资料变更后，调用这个接口同步用户到底座。
```

请求头：

```text
X-App-Id: app_a
X-App-Secret: app_secret
Content-Type: application/json
```

请求体：

```json
{
  "email": "teacher@example.com",
  "externalUserId": "a_10001",
  "username": "teacher01",
  "displayName": "张老师",
  "emailVerified": true
}
```

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `email` | 是 | 全平台唯一用户标识 |
| `externalUserId` | 是 | 业务应用自己的本地用户 ID |
| `username` | 否 | 业务应用中的用户名 |
| `displayName` | 否 | 显示名称 |
| `emailVerified` | 建议 | 业务应用是否已验证邮箱真实性 |

成功返回：

```json
{
  "platformUserId": "u_abc123",
  "email": "teacher@example.com",
  "created": false,
  "linked": true,
  "sourceAppId": "app_a",
  "applicationUser": {
    "appId": "app_a",
    "externalUserId": "a_10001",
    "firstLinkedAt": "2026-04-30T00:00:00.000Z",
    "lastSyncedAt": "2026-04-30T00:00:00.000Z"
  }
}
```

返回说明：

- `created = true`：底座本次创建了新的平台用户。
- `created = false`：底座已存在这个 email 对应的平台用户。
- `linked = true`：当前业务应用本地用户已绑定到平台用户。
- `platformUserId`：业务应用后续应保存的统一用户 ID。

## 8. 获取平台用户上下文

目标接口：

```text
GET /api/v1/app-auth/users/by-email?email=teacher@example.com
```

请求头：

```text
X-App-Id: app_a
X-App-Secret: app_secret
```

成功返回：

```json
{
  "platformUserId": "u_abc123",
  "email": "teacher@example.com",
  "username": "teacher01",
  "displayName": "张老师",
  "sourceAppId": "app_a",
  "organizations": [
    {
      "id": "org_id",
      "name": "示例学校",
      "code": "demo-school",
      "type": "SCHOOL",
      "role": {
        "key": "organization.teacher",
        "name": "老师",
        "permissions": ["organization:read", "class:read"]
      }
    }
  ],
  "classes": [
    {
      "id": "class_id",
      "name": "一年级 1 班",
      "code": "grade1-class1",
      "role": "TEACHER",
      "organization": {
        "id": "org_id",
        "name": "示例学校"
      }
    }
  ]
}
```

业务应用一般在登录成功后调用一次，并把返回结果放入自己的 session。

## 9. 建议的业务应用用户表

业务应用自己的用户表可以这样设计：

```text
users
- id                    业务应用本地用户 ID
- email                 用户邮箱
- password_hash         业务应用自己保存的密码哈希
- platform_user_id      底座返回的 platformUserId
- display_name
- created_at
- updated_at
```

登录后：

```text
1. A 应用校验 email + password。
2. 校验成功后调用 /app-auth/users/sync。
3. 保存或更新 platform_user_id。
4. A 应用建立自己的登录 session。
```

## 10. Node.js 最小接入示例

```js
const platformApiBaseUrl = 'http://meiyu.cdbbox.com/api/v1';
const appId = process.env.APP_ID;
const appSecret = process.env.APP_SECRET;

async function syncPlatformUser(localUser) {
  const response = await fetch(`${platformApiBaseUrl}/app-auth/users/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Id': appId,
      'X-App-Secret': appSecret,
    },
    body: JSON.stringify({
      email: localUser.email,
      externalUserId: localUser.id,
      username: localUser.username,
      displayName: localUser.displayName,
      emailVerified: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Sync platform user failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function login(email, password) {
  const localUser = await findLocalUserByEmail(email);

  if (!localUser) {
    throw new Error('Invalid account or password');
  }

  const passwordOk = await verifyLocalPassword(password, localUser.passwordHash);

  if (!passwordOk) {
    throw new Error('Invalid account or password');
  }

  const platformUser = await syncPlatformUser(localUser);

  await updateLocalUser(localUser.id, {
    platformUserId: platformUser.platformUserId,
  });

  return {
    localUserId: localUser.id,
    platformUserId: platformUser.platformUserId,
    email: platformUser.email,
  };
}
```

## 11. 常见错误

### Invalid application credentials

`appId` 或 `appSecret` 错误，或者应用已被禁用。

### email is required

业务应用没有传入邮箱。第一阶段必须使用邮箱作为统一身份标识。

### externalUserId is required

业务应用没有传入本地用户 ID。底座需要用它建立应用用户绑定关系。

### email belongs to another verified local user

同一个业务应用内，多个不同的 `externalUserId` 尝试绑定同一个 email。业务应用需要先在本地处理账号合并或阻止重复注册。

## 12. 联调检查清单

业务应用需要提供给平台管理员：

```text
业务应用名称：
业务应用首页 homeUrl：
业务应用服务器域名：
开发者负责人：
是否已验证用户邮箱：
```

平台管理员返回给业务开发者：

```text
平台 API Base URL：
appId：
appSecret：
Swagger 文档地址：
```

联调时确认：

- 业务应用注册用户后能调用底座同步用户。
- 业务应用登录成功后能调用底座同步用户。
- 同一个 email 在不同应用中返回同一个 `platformUserId`。
- 业务应用没有把 `appSecret` 放到浏览器或前端代码。
- 业务应用本地用户表保存了 `platformUserId`。

## 13. 当前实现状态

当前代码已经按本文档主线提供：

```text
POST /api/v1/app-auth/users/sync
GET /api/v1/app-auth/users/by-email
```

代码中也保留统一登录 SSO 相关接口，后续可以作为可选能力。第一阶段主线是：

```text
业务应用自有注册登录
应用服务端凭 appId / appSecret 调用底座
按 email 同步或归并用户
底座不保存业务用户密码
底座返回 platformUserId 和用户上下文
```
