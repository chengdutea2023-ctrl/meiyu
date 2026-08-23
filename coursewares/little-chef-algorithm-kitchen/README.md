# 小厨师的算法厨房

这是接入“智美教育新生态业务底座”的静态内部课件。

## 课件目标

学生通过 5 道儿童早餐风格菜品理解算法入门概念：输入输出算法、顺序算法、条件分支算法、循环反馈算法、优化算法。5 关统一采用“拖正确食材进输入篮，运行算法得到菜品”的交互。

## 本地预览

```bash
cd coursewares/little-chef-algorithm-kitchen
python3 -m http.server 4182
```

访问：

```text
http://localhost:4182/static/index.html?demo=1
```

`demo=1` 只用于本地预览，不会提交成绩到底座。

## 平台接入

课件会从 URL 读取：

```text
launchToken
platformApiBase
returnUrl
```

启动时调用：

```text
POST /course-runtime/launch/verify
```

完成时调用：

```text
POST /course-runtime/launch/records
```

本课件第一版不上传图片、录音、视频或学生作品，只上报结构化 `summary`，由业务底座生成默认投屏页。

## 打包

```bash
cd coursewares/little-chef-algorithm-kitchen
zip -r ../../little-chef-algorithm-kitchen-current.zip manifest.json README.md static \
  -x "*/node_modules/*" "*/.git/*" "*/.DS_Store" "*/.env"
```
