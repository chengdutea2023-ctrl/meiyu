# 本地开发接管

## 环境要求

- macOS 或 Linux
- Node.js 22，最低 Node.js 20
- npm
- Docker Desktop，或本地 PostgreSQL 与 Redis

## 首次启动

```bash
cd "/Users/zeng/工作/代码块/meiyu"
npm install
cp platform/api/.env.example platform/api/.env
docker compose up -d postgres redis
npm run prisma:generate
npm run db:migrate
npm run db:seed
npm run agent:doctor
```

`.env.example` 中的账号和密钥只用于本地演示，禁止用于生产。

## 日常启动

分别打开终端运行：

```bash
npm run dev:api
npm run dev:admin
```

可选示例应用：

```bash
npm run dev:demo
npm run dev:mandarin
```

本地地址：

```text
API：http://localhost:3000/api/v1
健康检查：http://localhost:3000/api/health
Swagger：http://localhost:3000/api/docs
管理后台：http://localhost:5173
示例应用：http://localhost:3001
普通话应用：http://localhost:3101
```

## 修改课件

课件只在 `coursewares/<slug>/` 中维护。修改后运行：

```bash
npm run coursewares:validate
npm run coursewares:test
npm run coursewares:package -- --slug <slug>
```

不要提交 `output/courseware-releases/`。正式 ZIP 必须在提交后重新生成，名称不得包含 `dirty`。

## 提交前检查

```bash
npm run agent:check
git status --short
```

若仓库存在并非本次任务产生的修改，保留并说明，不得擅自还原。
