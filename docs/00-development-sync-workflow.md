# 多设备开发与线上同步流程

本文档用于规范“Mac mini、笔记本、GitHub、线上服务器”之间的开发和部署关系，避免出现本地、线上、GitHub 三处代码不一致。

## 1. 核心原则

GitHub 是唯一代码中心。

```text
Mac mini
  -> git push
GitHub 仓库
  -> git pull / clone
笔记本

GitHub 仓库
  -> 部署到线上服务器
```

不要把线上服务器当作日常开发环境。服务器只负责运行和部署，不直接修改业务代码。

当前项目仓库：

```text
https://github.com/chengdutea2023-ctrl/meiyu
```

当前线上业务底座服务器：

```text
47.109.198.96
```

线上入口：

```text
管理员后台：http://data.docpine.online
教师后台：http://teacher.docpine.online
学生后台：http://student.docpine.online
课件运行区：http://agent.docpine.online
```

## 2. 每次开始开发前

无论在 Mac mini 还是笔记本，开始写代码前先进入项目目录并拉取最新代码。

```bash
cd /你的项目目录/meiyu
git pull --ff-only
```

如果 `git pull --ff-only` 成功，说明本机已经和 GitHub 对齐，可以继续开发。

如果失败，通常说明本机有未提交改动，或者 GitHub 上有别人推送的新提交。此时不要继续写代码，先处理同步问题。

## 3. 每次开发完成后

开发完成后先看改了什么。

```bash
git status
git diff
```

只提交本次相关改动。

```bash
git add 需要提交的文件
git commit -m "说明这次修改了什么"
git push origin main
```

如果改动很多，推荐拆成几次提交，例如：

```bash
git add apps/admin-web/src/App.tsx
git commit -m "fix: improve admin course scheduling"

git add docs/13-internal-courseware-developer-handoff.md
git commit -m "docs: update courseware handoff rules"

git push origin main
```

## 4. Mac mini 与笔记本切换流程

### 4.1 从 Mac mini 切到笔记本

在 Mac mini 上完成：

```bash
git status
git add .
git commit -m "本次修改说明"
git push origin main
```

在笔记本上执行：

```bash
cd /你的项目目录/meiyu
git pull --ff-only
```

如果笔记本还没有项目：

```bash
git clone https://github.com/chengdutea2023-ctrl/meiyu.git
cd meiyu
npm install
```

### 4.2 从笔记本切回 Mac mini

在笔记本上完成：

```bash
git status
git add .
git commit -m "本次修改说明"
git push origin main
```

回到 Mac mini 后执行：

```bash
cd /Users/zeng/工作/代码块/meiyu
git pull --ff-only
```

## 5. 开发前后的本地检查

常规修改至少跑：

```bash
npm run build --workspace apps/admin-web
npm run build --workspace platform/api
```

如果改了 SDK：

```bash
npm run build --workspace packages/sdk
```

如果改了数据库模型或 Prisma：

```bash
npm run prisma:generate
npm run db:deploy
npm run build --workspace platform/api
```

如果改了前端页面，建议本地打开后台做一次冒泡测试：

```text
http://localhost:5173
```

## 6. 线上部署规则

线上部署只应该部署 GitHub 上已经提交的代码，不部署“本地未提交改动”。

推荐顺序：

```bash
git status
npm run build --workspace apps/admin-web
npm run build --workspace platform/api
git add .
git commit -m "本次修改说明"
git push origin main
```

确认 GitHub 已经是最新后，再部署线上。

当前线上不是 Docker 部署，而是：

```text
systemd + nginx + Node.js
```

线上应用目录：

```text
/opt/zhimei-education-platform/app
```

线上课件运行目录：

```text
/opt/zhimei-education-platform/courses
```

线上 API 服务：

```text
meiyu-api.service
```

部署时应避免覆盖：

```text
.env
.env.*
node_modules
.git
/opt/zhimei-education-platform/courses
/opt/zhimei-education-platform/shared/api.env
```

## 7. 不允许提交到 Git 的内容

下面这些不要提交到 GitHub：

```text
.env
.env.production
.env.local
node_modules/
dist/
.DS_Store
服务器 root 密码
数据库密码
APP_SECRET
管理员密码
学生作品原始文件
课件运行产生的录音、图片、过程数据
```

如果不确定某个文件能不能提交，先执行：

```bash
git status --short
```

逐个确认后再 `git add`。

## 8. 推荐的日常命令

### 查看当前是否干净

```bash
git status --short --branch
```

看到类似下面这样，说明本地和 GitHub 对齐，且没有未提交改动：

```text
## main...origin/main
```

### 查看本地是否领先或落后 GitHub

```bash
git rev-list --left-right --count origin/main...HEAD
```

结果含义：

```text
0 0  本地和 GitHub 一致
0 2  本地领先 GitHub 2 个提交，需要 push
1 0  本地落后 GitHub 1 个提交，需要 pull
1 2  本地和 GitHub 各有新提交，需要谨慎处理
```

### 查看最近提交

```bash
git log --oneline -5
```

### 查看远程仓库地址

```bash
git remote -v
```

## 9. 遇到常见问题怎么办

### 9.1 `git pull --ff-only` 失败

不要马上强制覆盖。先看状态：

```bash
git status
git diff
```

如果本机改动还没提交，先提交：

```bash
git add .
git commit -m "保存本机改动"
git pull --rebase
```

如果不确定怎么处理，先停下来，让 Codex 检查。

### 9.2 GitHub 不是最新，但线上看起来是新的

这说明有人可能直接把本地代码同步到了服务器，却没有推送 GitHub。

处理原则：

1. 先确认本地改动。
2. 把本地最新代码提交并推送 GitHub。
3. 再部署线上。
4. 最后确认本地、GitHub、线上三处一致。

### 9.3 服务器上不要直接改代码

如果在线上服务器临时改了代码，要尽快把改动同步回本地并提交 GitHub。否则下次部署可能会覆盖服务器上的临时改动。

正确做法是：本地开发，本地提交，GitHub 保存，线上部署。

## 10. Codex 多设备使用建议

Codex 账号可以在多台电脑使用，但 Codex 会话本身不应该作为代码同步工具。

真正保证项目一致的是 GitHub，不是 Codex 会话。

建议：

- 每台电脑都 clone 同一个 GitHub 仓库。
- 每次让 Codex 开始工作前，先让它检查：

```bash
git status --short --branch
git rev-list --left-right --count origin/main...HEAD
```

- 每次让 Codex 完成工作后，要求它：

```text
构建检查 -> git status -> commit -> push -> 如需要则部署线上 -> 给出结果
```

## 11. 给 Codex 的固定提示词

换电脑或新开会话时，可以直接把下面这段发给 Codex：

```text
这是智美教育新生态业务底座项目。
仓库地址：https://github.com/chengdutea2023-ctrl/meiyu
请先进入项目目录，检查 git status、origin/main 和 HEAD 是否一致。
开始任何修改前，先 git pull --ff-only。
修改完成后，先跑必要构建，再提交并推送 GitHub。
如果我要更新线上，请先确认 GitHub 已经是最新，再部署到服务器。
不要提交 .env、密码、APP_SECRET、node_modules、dist、学生作品数据。
不要直接覆盖服务器上的课程运行目录 /opt/zhimei-education-platform/courses。
```

## 12. 最终目标

任何时候都尽量保持：

```text
Mac mini 本地代码 = GitHub main = 笔记本本地代码 = 线上部署代码
```

如果四者不一致，优先把 GitHub 恢复为可信标准，再让其他环境向 GitHub 对齐。
