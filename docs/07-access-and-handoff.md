# 智美教育新生态业务底座访问与交接文档

本文档用于记录当前测试环境访问地址、代码仓库、主要接口和部署交接信息。

## 1. 项目信息

```text
项目名称：智美教育新生态业务底座
代码目录：/Users/zeng/工作/代码块/meiyu
GitHub 仓库：https://github.com/chengdutea2023-ctrl/meiyu
服务器：阿里云 ECS
服务器公网 IP：47.109.130.163
绑定域名：meiyu.cdbbox.com
```

## 2. 用户访问地址

测试环境：

```text
后台管理页：http://meiyu.cdbbox.com
API 文档 / Swagger：http://meiyu.cdbbox.com/api/docs
示例业务应用：http://meiyu.cdbbox.com/demo/
普通话练习第三方测试应用：http://meiyu.cdbbox.com/mandarin/
```

本地开发环境：

```text
后台管理页：http://localhost:5173
API 文档 / Swagger：http://localhost:3000/api/docs
示例业务应用：http://localhost:3001
普通话练习第三方测试应用：http://localhost:3101
```

## 3. 管理员登录

本地默认管理员：

```text
邮箱：admin@example.com
密码：ChangeMe123!
```

线上测试环境管理员：

```text
邮箱：admin@example.com
密码：不写入仓库文档，保存在服务器 /root/meiyu-admin-password.txt
```

## 4. 当前业务逻辑

第一阶段主线：

```text
业务应用自己注册用户
业务应用自己登录用户
业务应用自己保存用户密码
业务应用登录成功后，服务端调用业务底座 API 同步用户
业务底座按 email 归并用户并返回 platformUserId
```

业务底座不保存业务用户密码。平台管理员账号是例外，用于登录后台管理系统。

## 5. 业务应用接入接口

业务应用服务端认证请求头：

```text
X-App-Id: 业务应用 appId
X-App-Secret: 业务应用 appSecret
Content-Type: application/json
```

同步用户：

```text
POST http://meiyu.cdbbox.com/api/v1/app-auth/users/sync
```

请求示例：

```json
{
  "email": "teacher@example.com",
  "externalUserId": "a_10001",
  "username": "teacher01",
  "displayName": "张老师",
  "emailVerified": true
}
```

查询平台用户上下文：

```text
GET http://meiyu.cdbbox.com/api/v1/app-auth/users/by-email?email=teacher@example.com
```

详细接入文档：

```text
docs/05-business-app-api-guide.md
```

## 5.1 普通话练习第三方测试应用

本项目内置了一个模拟第三方系统：

```text
目录：examples/mandarin-practice-app
启动命令：npm run dev:mandarin
访问地址：http://localhost:3101
本地数据库：examples/mandarin-practice-app/data/mandarin-practice-db.json
appId：mandarin-practice-app
appSecret：mandarin-practice-secret
```

它独立实现：

```text
注册页面
登录页面
密码哈希保存
普通话练习页面
练习记录保存
调用业务底座同步用户
显示底座 platformUserId
```

## 6. 已保留的可选 SSO 能力

当前代码仍保留统一登录 SSO 能力，作为后续可选接入方式：

```text
GET /sso/authorize
POST /api/v1/auth/token
GET /api/v1/auth/me
```

第一阶段主线不是 SSO，而是业务应用服务端用户同步。

## 7. 本地开发常用命令

```bash
npm install
npm run prisma:generate
npm run db:migrate
npm run db:seed
npm run dev:api
npm run dev:admin
npm run dev:demo
```

验证构建：

```bash
npm run build
npm run lint
npx prisma validate --schema platform/api/prisma/schema.prisma
```

## 8. 服务器部署方式

当前测试环境使用非 Docker 方式部署：

```text
Node.js 22
PostgreSQL
Redis
Nginx
systemd
```

服务器代码目录：

```text
/opt/zhimei-education-platform
```

systemd 服务：

```text
meiyu-api：平台 API 服务
meiyu-demo：示例业务应用
nginx：后台静态页和反向代理
```

常用检查命令：

```bash
systemctl status meiyu-api meiyu-demo nginx postgresql redis-server --no-pager
journalctl -u meiyu-api -n 100 --no-pager
journalctl -u meiyu-demo -n 100 --no-pager
```

## 9. 本次重构状态

本次重构已按文档主线完成：

```text
新增 ApplicationUser 绑定表
业务用户 passwordHash 可为空
业务用户 username 可为空
Application 增加 allowedOrigins
新增 /api/v1/app-auth/users/sync
新增 /api/v1/app-auth/users/by-email
SDK 增加 syncApplicationUser 和 getPlatformUserByEmail
后台业务应用登记支持 allowedOrigins
文档口径已从统一登录主线改为业务应用用户同步主线
```

上线时需要执行数据库迁移：

```bash
npm run db:deploy --workspace @jiaoxue/platform-api
```
