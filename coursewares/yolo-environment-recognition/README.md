# 环境物体识别

- slug: `yolo-environment-recognition`；运行类型: `BOTH`；平台入口: `/`。
- 保留摄像头、YOLOv8n COCO 80 类识别、最多三张作品图片和本课问卷；也可上传本地图片完成识别。
- ONNX Runtime Web 1.19.2 的 JS / MJS / WASM 随包本地化，许可证与第三方许可声明位于 `static/vendor/`，不再依赖外部 CDN。
- ONNX 模型沿用原包的 `static/models/yolov8n-int8.onnx`；移除内容相同的重复模型及未使用的历史脚本。模型名称不构成量化类型或商用授权证明，模型来源、精度与许可须由模型提供方确认。

## 保存与权限

页面读取 `launchToken`、`platformApiBase`、`returnUrl`；正式模式先验证并上报 `STARTED`。无凭证或过期时不开放课程操作。图片与问卷先上传为平台附件，全部成功后才写入 `COMPLETED`。分数为 `null`，显示未评分、等待评价，不自动打分。

失败后冻结首次提交内容，重试只补传失败附件或重试学习记录；保存成功后才显示完成和返回入口。拍摄数据只保存在当前页面内存，不写入浏览器本地存储；离开未保存页面会提示，强制关闭后仍可能丢失未上传内容。

摄像头在页面隐藏、离开和完成时停止。摄像头需要 HTTPS 或 localhost 及用户授权；真实 iPad 摄像头和低性能设备须上线前单独验收。

## 本地预览

在 `server/` 由环境提供 `PORT` 后运行 `npm start`，默认仅监听 `127.0.0.1`；可配置 `HOST` 及 `NEXT_PUBLIC_COURSE_BASE_PATH`。访问 `/?demo=1`，明确提示本地预览不保存成绩。亦可使用普通静态 HTTP 服务托管 `static/`。
