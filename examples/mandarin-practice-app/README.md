# 普通话练习第三方测试应用

这是一个模拟第三方课件/智能体系统的测试应用。

它有自己的：

```text
访问地址：http://localhost:3101
业务页面
本地业务数据库文件
普通话练习记录
```

它不再有自己的教师/学生注册和密码保存。用户通过智美教育新生态业务底座统一登录，应用只保存 `platformUserId` 和练习业务数据。

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
MANDARIN_APP_DB_PATH=examples/mandarin-practice-app/data/mandarin-practice-db.json
```

`mandarin-practice-app` 的 SSO 回调地址需要包含：

```text
http://localhost:3101/auth/callback
```

## 验证点

1. 打开 `http://localhost:3101`。
2. 点击“使用底座账号登录”。
3. 页面跳转到业务底座 `/sso/authorize`。
4. 用户在底座登录；没有学生账号时可在底座登录页注册学生账号。
5. 登录成功后回到 `http://localhost:3101/auth/callback`。
6. 应用服务端使用 `code + appSecret` 换取 token，并调用 `/api/v1/auth/me` 获取用户上下文。
7. 练习记录保存在本应用数据库，记录中关联 `platformUserId`。

## 当前接入方式

使用的底座接口：

```text
GET /sso/authorize
POST /api/v1/auth/token
GET /api/v1/auth/me
```

不再使用：

```text
POST /api/v1/app-auth/users/sync
```
