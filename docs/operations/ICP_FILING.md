# 网站备案页脚

`docpine.online` 及其子域名的 HTML 页面统一显示 `蜀ICP备2026015042号-1`，链接到 `https://beian.miit.gov.cn/`，在新标签页打开。其他同机域名、IP 地址不套用此备案号。

网关采用 Nginx HTTP sub 模块，在 HTML 的 `</body>` 之前追加正常文档流页脚。它覆盖后台登录与业务页、注册页、课件、投屏页以及代理展示页面，不修改 JSON、上传、图片或模型响应。上游 HTML 使用未压缩传输，面向浏览器的压缩仍由 Nginx 处理。

## 安装

先完成 Git 发布预检、数据库只读备份和现有配置备份，再从已验证提交执行：

```bash
node scripts/install-icp-footer.cjs
node scripts/install-icp-footer.cjs --apply --backup /var/backups/zhike/<unique-release>/nginx-footer
```

脚本保留现有域名、证书、代理目的地址和运行目录，仅安装两个受版本管理的配置片段及其引用。先检查 `nginx -t`，成功后只 reload Nginx；不重启 API、不修改数据库。失败会恢复原文件并重新检查配置。重复执行无新增改动。

备案域名的 DNS 和证书必须另行核实。此脚本不调整 DNS、不替换证书，也不操作另一台服务器。

## 验收与回滚

确认各公开入口 HTTP 正常，HTML 中存在准确备案号和工信部链接；在电脑及 iPad/手机视口滚动到页脚，验证链接可点击且不遮挡控件。核对 API 健康以及 JSON、媒体响应未受影响。

备份目录的 `journal.json` 记录原配置及目标文件。只恢复本次变更的 Nginx 文件，执行 `nginx -t` 后 reload；本次无需恢复数据库，避免覆盖发布之后产生的业务数据。
