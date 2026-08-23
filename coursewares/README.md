# 课件源码主库

过渡期内，本目录是 7 个课件的唯一源码主库。课件问题只在原业务底座修复；SaaS 重构仓库不接收日常课件更新。

## 校验

```bash
npm run coursewares:validate
npm run coursewares:test
```

## 打包

```bash
npm run coursewares:package
npm run coursewares:package -- --slug four-panel-story-studio
```

输出位于 `output/courseware-releases/`，ZIP 名称包含当前 Git 提交号，`release-manifest.json` 记录文件大小和 SHA-256。源码尚未提交时，包名和清单会标记 `dirty`；正式上传应使用提交后生成的不带 `dirty` 的版本。

不要把运行目录反向复制进本目录。课件源码禁止包含 `node_modules`、`.runtime`、`.codex-backups`、日志、PID、`.env` 和 `server/data`。学生作品、录音、图片和其他业务数据必须保存在独立数据目录中。
