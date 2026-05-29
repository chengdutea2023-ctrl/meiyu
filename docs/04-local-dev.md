# 本地开发

说明：当前主线是“业务底座统一注册/登录 + 第三方业务应用 SSO 接入 + 授权范围内读取用户”。

## 前置依赖

- Node.js 22 推荐，Node.js 20+ 可用
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
普通话应用：mandarin-practice-app / mandarin-practice-secret
示例学校：demo-school
示例班级：一年级 1 班
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

后台可以完成：

- 创建学生/教师/管理员
- 审核教师
- 创建学校和班级
- 将用户加入学校/班级
- 登记业务应用
- 配置业务应用可读取的学校/班级范围

## 启动示例业务应用

另开一个终端：

```bash
npm run dev:demo
```

示例应用地址：

```text
http://localhost:3001
```

浏览器流程：

```text
http://localhost:3001
  -> /login
  -> http://localhost:3000/sso/authorize
  -> 底座统一登录页
  -> http://localhost:3001/auth/callback
  -> /me
```

## 启动普通话练习第三方测试应用

普通话练习应用用于验证“第三方应用 SSO 接入 + 本地业务数据独立保存”。它不注册用户，不保存平台密码。

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
1. 打开 http://localhost:3101。
2. 点击“使用底座账号登录”。
3. 页面跳转到 http://localhost:3000/sso/authorize。
4. 使用底座账号登录；没有学生账号时可在底座登录页注册学生账号。
5. 登录成功后跳回 http://localhost:3101/auth/callback。
6. 普通话应用服务端用 code + appSecret 换 token。
7. 普通话应用调用 /api/v1/auth/me 获取用户上下文。
8. 完成练习后，练习记录保存在普通话应用自己的数据库文件。
```

默认配置：

```text
appId：mandarin-practice-app
appSecret：mandarin-practice-secret
SSO 回调地址：http://localhost:3101/auth/callback
本地数据库：examples/mandarin-practice-app/data/mandarin-practice-db.json
```

## SSO 手工验证

1. 浏览器打开 `/sso/authorize`：

```text
http://localhost:3000/sso/authorize?appId=mandarin-practice-app&redirectUri=http://localhost:3101/auth/callback
```

2. 登录成功后复制回调里的 `code`。

3. 使用 code 换 token：

```bash
curl -X POST http://localhost:3000/api/v1/auth/token \
  -H "Content-Type: application/json" \
  -d '{
    "appId": "mandarin-practice-app",
    "appSecret": "mandarin-practice-secret",
    "code": "替换为回调 code",
    "redirectUri": "http://localhost:3101/auth/callback"
  }'
```

4. 使用 access token 查询当前用户：

```bash
curl http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer 替换为 accessToken"
```

## 业务应用只读接口验证

读取授权范围内学生：

```bash
curl "http://localhost:3000/api/v1/app-auth/users?userType=STUDENT" \
  -H "X-App-Id: mandarin-practice-app" \
  -H "X-App-Secret: mandarin-practice-secret"
```

按邮箱查询用户上下文：

```bash
curl "http://localhost:3000/api/v1/app-auth/users/by-email?email=student@example.com" \
  -H "X-App-Id: mandarin-practice-app" \
  -H "X-App-Secret: mandarin-practice-secret"
```

旧同步接口已禁用：

```text
POST /api/v1/app-auth/users/sync -> 403
```
