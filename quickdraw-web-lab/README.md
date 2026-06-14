# 神经网络涂鸦识别课件交付说明

## 课件信息

- 课件访问短名：`quickdraw-web-lab`
- 课件名称：`神经网络涂鸦识别`
- 运行类型：`BOTH`
- 入口：`/`
- Node 端口：`null`，由业务底座自动分配

## 底座接入

- 从 URL 读取 `launchToken`。
- 从 URL 读取 `platformApiBase` 和 `returnUrl`，不在代码中写死底座地址或返回地址。
- 使用 `platformApiBase + /course-runtime/launch/verify` 校验学生上下文。
- 一局完成后，前端调用课件服务端 `POST /api/submit`。
- 服务端使用本次提交携带的 `platformApiBase` 校验 `launchToken`，保存最终 PNG 图片、笔画轨迹和识别历史，再调用 `platformApiBase + /course-runtime/launch/records` 上报 `COMPLETED`。
- 上报内容包含百分制成绩、学习耗时、作品详情入口 `artifactUrl`、投屏入口 `projectorUrl`、最终图片入口 `imageUrl` 和摘要。
- TensorFlow.js 已本地化到 `static/vendor/tf.min.js`，正式运行不依赖 CDN。
- 课件页面不包含登录、注册、找回密码、重置密码或邮箱密码表单。
- 页面包含“返回学生后台”按钮，优先跳转 `returnUrl`，没有 `returnUrl` 时回到上一页。

## 服务端接口

- `POST /api/submit`：保存本次涂鸦最终 PNG 图片、笔画轨迹、识别历史，并上报底座。
- `GET /work/:workId`：教师查看作品详情。
- `GET /work/:workId/image.png`：打开或下载学生最终作品图片。
- `GET /projector/:workId`：课堂投屏展示页面。
- `GET /health`：服务健康检查。

服务端写入接口会用 `launchToken` 调用底座校验接口，学生身份、班级、任务、课程和课件上下文均来自底座返回结果，不信任前端传入身份。

## 数据存储

默认测试存储目录为 `server/data/works/{workId}/`，其中包含：

- `image.png`：学生最终作品图片。
- `work.json`：底座上下文、成绩、笔画轨迹和识别历史。
- `rounds/round-*.png`：每轮绘图图片。

也可以用环境变量 `COURSEWARE_DATA_DIR` 指定平台分配的持久数据目录。

`server/data/` 只适合本地或临时测试；正式长期保存请使用平台分配的持久目录、课件数据库或对象存储。

## 本地测试

前端可以用静态服务器预览。本地没有 `launchToken` 或 `platformApiBase` 时仍可试玩，但作品和成绩不会回传。

服务端本地测试：

```bash
cd server
npm start
```

## ZIP 结构

```text
quickdraw-web-lab.zip
  manifest.json
  static/
    index.html
    app.js
    styles.css
    vendor/
      tf.min.js
    models/
  server/
    package.json
    server.js
```

不要打包 `node_modules`、`.git`、`.env`、旧账号数据、外部 CDN 引用或服务端密钥。
