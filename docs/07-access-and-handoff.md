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
底座注册教师和学生
底座保存平台账号密码
教师注册后等待管理员审核
学生注册后默认可登录
管理员维护学校、班级和用户归属
第三方业务应用通过 SSO 登录接入
第三方业务应用只保存自己的业务数据
第三方业务应用用 platformUserId 关联底座用户
第三方业务应用只能读取授权范围内的平台用户
```

旧的第三方同步注册模型已经废弃。

## 5. 业务应用接入接口

浏览器登录入口：

```text
GET http://meiyu.cdbbox.com/sso/authorize?appId=业务应用appId&redirectUri=业务应用回调地址
```

code 换 token：

```text
POST http://meiyu.cdbbox.com/api/v1/auth/token
```

当前用户上下文：

```text
GET http://meiyu.cdbbox.com/api/v1/auth/me
Authorization: Bearer accessToken
```

业务应用服务端只读接口认证请求头：

```text
X-App-Id: 业务应用 appId
X-App-Secret: 业务应用 appSecret
```

读取授权范围内用户：

```text
GET http://meiyu.cdbbox.com/api/v1/app-auth/users?userType=STUDENT
```

按邮箱查询授权范围内用户：

```text
GET http://meiyu.cdbbox.com/api/v1/app-auth/users/by-email?email=student@example.com
```

已禁用：

```text
POST http://meiyu.cdbbox.com/api/v1/app-auth/users/sync
```

详细接入文档：

```text
docs/05-business-app-api-guide.md
```

## 6. 普通话练习第三方测试应用

本项目内置了一个模拟第三方系统：

```text
目录：examples/mandarin-practice-app
启动命令：npm run dev:mandarin
访问地址：http://localhost:3101
本地数据库：examples/mandarin-practice-app/data/mandarin-practice-db.json
appId：mandarin-practice-app
appSecret：mandarin-practice-secret
SSO 回调：http://localhost:3101/auth/callback
```

它用于验证：

```text
跳转到底座 SSO 登录
使用 code + appSecret 换 token
读取 /api/v1/auth/me 用户上下文
本地保存练习记录
练习记录关联 platformUserId
```

## 7. 本地开发常用命令

```bash
npm install
npm run prisma:generate
npm run db:migrate
npm run db:seed
npm run dev:api
npm run dev:admin
npm run dev:demo
npm run dev:mandarin
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

## 9. 本次本地重构状态

本次本地重构已按最新主线完成：

```text
User 增加 userType、approvalStatus、ageBand
新增学生/教师注册模块
教师默认待审核，学生默认已通过
登录和 SSO 阻止未审核教师进入
新增业务应用授权学校/班级范围
新增 /api/v1/app-auth/users 只读接口
旧 /api/v1/app-auth/users/sync 改为 403 禁用
后台支持教师审核和应用授权范围配置
普通话练习测试应用改为 SSO 接入
文档已按新主线更新
```

上线时需要执行数据库迁移：

```bash
npm run db:deploy --workspace @jiaoxue/platform-api
```
