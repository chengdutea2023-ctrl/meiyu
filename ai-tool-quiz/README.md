# 哪些是 AI 工具课件交付说明

## 课件信息

- 课件访问短名：`ai-tool-quiz`
- 课件名称：`哪些是 AI 工具`
- 运行类型：`STATIC`
- 入口：`/`

## 底座接入

- 从 URL 读取 `launchToken`。
- 从 URL 读取 `platformApiBase` 和 `returnUrl`，不在代码中写死底座地址或返回地址。
- 使用 `platformApiBase + /course-runtime/launch/verify` 校验学生上下文。
- 提交答案后调用 `platformApiBase + /course-runtime/launch/records` 上报 `COMPLETED`。
- 上报内容包含百分制成绩、学习耗时、答对数量、选择项和题目摘要。
- 图片资源已放入 `static/assets/`，正式运行不依赖 CDN 或远程图片。
- 课件页面不包含登录、注册、找回密码、重置密码或邮箱密码表单。
- 页面包含“返回学生后台”按钮，优先跳转 `returnUrl`，没有 `returnUrl` 时回到上一页。

## 本地测试

直接打开 `static/index.html` 或用任意静态服务器预览即可。本地没有 `launchToken` 或 `platformApiBase` 时仍可试玩，但成绩不会回传。

## ZIP 结构

```text
ai-tool-quiz.zip
  manifest.json
  static/
    index.html
    app.js
    styles.css
    assets/
```

不要打包 `node_modules`、`.git`、`.env`、部署密钥、外部 CDN 引用或服务端密钥。
