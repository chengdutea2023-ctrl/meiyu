# 普通话练习第三方测试应用

这是一个完全模拟第三方系统的测试应用。

它有自己的：

```text
访问地址：http://localhost:3101
注册页面
登录页面
用户密码保存
本地用户数据库文件
普通话练习业务数据
```

它不使用业务底座登录页。用户在本应用注册或登录成功后，应用服务端调用业务底座：

```text
POST /api/v1/app-auth/users/sync
GET /api/v1/app-auth/users/by-email
```

## 本地启动

先启动业务底座 API，并确保 seed 已创建 `mandarin-practice-app`：

```bash
npm run dev:api
```

另开终端启动本应用：

```bash
npm run dev:mandarin
```

默认配置：

```text
MANDARIN_APP_PORT=3101
MANDARIN_APP_PUBLIC_URL=http://localhost:3101
PLATFORM_PUBLIC_URL=http://localhost:3000
MANDARIN_APP_ID=mandarin-practice-app
MANDARIN_APP_SECRET=mandarin-practice-secret
MANDARIN_AGENT_NAME=普通话练习智能体
MANDARIN_APP_DB_PATH=examples/mandarin-practice-app/data/mandarin-practice-db.json
```

## 验证点

1. 在 `http://localhost:3101/register` 注册用户。
2. 应用把密码保存在自己的本地数据库文件里。
3. 应用调用业务底座同步用户。
4. 同步字段包含 `displayName`、`ageBand`、`agentName` 和 `platformUserId`。
5. 页面显示底座返回的 `platformUserId`。
6. 业务底座后台可以在业务应用下按智能体查看同步用户。
7. 普通话练习记录保存在本应用自己的数据库里。
