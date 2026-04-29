# GitHub + 阿里云 ECS 部署方案

本文档用于把智美教育新生态业务底座部署到阿里云 ECS 测试环境，并让本地修改可以通过 GitHub 同步到线上。

## 推荐架构

第一阶段测试环境使用：

```text
GitHub 仓库
  -> 阿里云 ECS
     -> Docker Compose
        -> platform-api
        -> admin-web
        -> teaching-demo-app
        -> postgres
        -> redis
```

测试阶段可以先用 ECS 公网 IP 访问。正式对外使用前，再补域名、HTTPS、RDS PostgreSQL 和阿里云 Redis。

## 本地准备 GitHub 仓库

在 GitHub 创建一个空仓库，例如：

```text
zhimei-education-platform
```

本地项目目录：

```bash
cd "/Users/zeng/工作/代码块/jiaoxue"
```

初始化并推送：

```bash
git init
git add .
git commit -m "Initial education platform"
git branch -M main
git remote add origin git@github.com:YOUR_GITHUB_NAME/zhimei-education-platform.git
git push -u origin main
```

注意不要提交这些内容：

```text
node_modules/
dist/
.env
.env.production
```

项目已经通过 `.gitignore` 和 `.dockerignore` 排除了这些文件。

## 阿里云 ECS 准备

建议 ECS 配置：

```text
操作系统：Ubuntu 22.04 LTS 或 Ubuntu 24.04 LTS
CPU/内存：2 核 4G 起步
磁盘：40G 起步
安全组开放端口：22, 3000, 3001, 8080
```

PostgreSQL 和 Redis 在 `docker-compose.prod.yml` 中默认只绑定 `127.0.0.1`，不要在安全组里开放 `5432` 和 `6379` 到公网。

登录服务器：

```bash
ssh root@YOUR_ECS_PUBLIC_IP
```

安装基础软件：

```bash
apt update
apt install -y git ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
docker version
docker compose version
```

如果 Docker 官方源访问慢，可以改用阿里云 Docker CE 镜像源。

## 拉取代码

推荐部署目录：

```bash
mkdir -p /opt
cd /opt
git clone git@github.com:YOUR_GITHUB_NAME/zhimei-education-platform.git
cd /opt/zhimei-education-platform
```

如果服务器还没有配置 GitHub SSH key，可以先用 HTTPS：

```bash
git clone https://github.com/YOUR_GITHUB_NAME/zhimei-education-platform.git
```

## 配置生产环境变量

复制配置文件：

```bash
cp .env.production.example .env.production
```

编辑：

```bash
nano .env.production
```

至少替换：

```text
YOUR_ECS_PUBLIC_IP
CHANGE_ME_STRONG_POSTGRES_PASSWORD
CHANGE_ME_LONG_RANDOM_ACCESS_SECRET
CHANGE_ME_LONG_RANDOM_REFRESH_SECRET
CHANGE_ME_ADMIN_PASSWORD
CHANGE_ME_DEMO_APP_SECRET
```

可以用下面命令生成随机密钥：

```bash
openssl rand -hex 32
```

测试阶段如果使用公网 IP，示例：

```text
PLATFORM_PUBLIC_URL="http://服务器公网IP:3000"
VITE_API_BASE_URL="http://服务器公网IP:3000/api/v1"
CORS_ORIGINS="http://服务器公网IP:8080,http://服务器公网IP:3001"
DEMO_APP_PUBLIC_URL="http://服务器公网IP:3001"
```

## 启动服务

构建并启动：

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

如果只是想用示例环境变量检查配置语法，可以在本地运行：

```bash
APP_ENV_FILE=.env.production.example docker compose -f docker-compose.prod.yml --env-file .env.production.example config
```

查看服务：

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production ps
```

查看日志：

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f api
```

第一次启动后初始化 seed 数据：

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec api npm run db:seed --workspace @jiaoxue/platform-api
```

## 测试访问

```text
API / Swagger：http://服务器公网IP:3000/api/docs
后台管理：http://服务器公网IP:8080
示例业务应用：http://服务器公网IP:3001
```

后台默认账号来自 `.env.production`：

```text
ADMIN_EMAIL
ADMIN_PASSWORD
```

## 本地修改同步到线上

本地修改代码后：

```bash
npm run lint
npm run build
git add .
git commit -m "Describe your change"
git push
```

服务器上更新：

```bash
cd /opt/zhimei-education-platform
git pull --ff-only
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

也可以使用项目脚本：

```bash
APP_DIR=/opt/zhimei-education-platform sh scripts/deploy.sh
```

## 分享给其他开发者

推荐 GitHub 协作规则：

```text
main：线上测试环境使用
feature/xxx：开发者各自功能分支
Pull Request：合并前代码审查
```

开发者本地启动：

```bash
npm install
cp platform/api/.env.example platform/api/.env
docker compose up -d postgres redis
npm run prisma:generate
npm run db:migrate
npm run db:seed
npm run dev:api
npm run dev:admin
npm run dev:demo
```

## 后续升级

测试环境跑通后，建议按顺序升级：

1. 使用域名代替公网 IP。
2. 使用 Nginx / HTTPS。
3. PostgreSQL 迁移到阿里云 RDS。
4. Redis 迁移到阿里云 Redis。
5. GitHub Actions 自动部署。
6. 支付中心上线前补充回调域名和 HTTPS 证书。
