# 教学辅助演示应用

这个目录是一个独立业务应用示例，使用 Node.js 内置 HTTP 服务运行，不依赖底座服务器代码。

第一阶段先用它验证统一登录接入流程：

1. 业务应用把用户引导到底座授权地址。
2. 底座生成一次性 `code`。
3. 业务应用服务端使用 `code + appSecret` 换取 token。
4. 业务应用使用 token 调用底座 `/api/v1/auth/me` 获取用户上下文。

默认 seed 会创建一个演示应用：

```text
appId: demo-teaching-app
appSecret: demo-app-secret
redirectUri: http://localhost:3001/auth/callback
```

启动：

```bash
npm run start --workspace @jiaoxue/teaching-demo-app
```

访问：

```text
http://localhost:3001
```

