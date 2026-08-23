# 课件目录

机器可读清单以 `coursewares/catalog.json` 为唯一事实来源，`manifest.json` 的标题、slug 和运行类型必须与清单一致。

| 标题 | slug | 类型 | 身份 | 作品/成绩 | 投屏 |
| --- | --- | --- | --- | --- | --- |
| AI 会生成还是判断 | `ai-generate-or-judge-quiz` | `STATIC` | 需要 | 成绩 | 支持 |
| 你猜我画 | `courseware` | `BOTH` | 需要 | 作品与成绩 | 支持 |
| 什么是 AI | `courseware-eqeh95dsq` | `STATIC` | 需要 | 成绩 | 不支持 |
| AI 猜拳擂台：认识判别式 AI | `courseware-ki863uyx1` | `STATIC` | 需要 | 作品与成绩 | 支持 |
| AI 四格故事工坊 | `four-panel-story-studio` | `BOTH` | 需要 | 作品与成绩 | 支持 |
| 小厨师的算法厨房 | `little-chef-algorithm-kitchen` | `STATIC` | 需要 | 成绩 | 支持 |
| 小明回家 | `xiaoming-huijia` | `STATIC` | 需要 | 作品与成绩 | 支持 |

## 运行规则

- `STATIC`：由平台直接提供静态文件。
- `NODE`：由独立 Node 进程运行。
- `BOTH`：同时包含静态界面和 Node 服务。
- `nodePort` 在源码清单中可为 `null`，生产端口由部署系统分配，不能在课件代码中硬编码。
- 课件入口必须读取平台提供的 `launchToken`、`platformApiBase` 和 `returnUrl`。

## 发布

```bash
npm run coursewares:validate
npm run coursewares:package
```

生成物位于 `output/courseware-releases/`，并带有 Git 提交号和 SHA-256 清单。
