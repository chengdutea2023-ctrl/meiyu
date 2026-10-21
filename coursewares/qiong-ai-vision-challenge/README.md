# 邛窑AI眼力挑战 1.0.0

智课正式 STATIC 课件，采用手册风格。适合初中及以上，建议15–20分钟，可独立使用，不需要摄像头、外部AI账号、付费服务或作业前置。

## 课堂流程

观察碗、罐、壶 → 自己预测 → 识别原图 → 仅改变遮挡、旋转、模糊之一 → 再次预测并识别 → 恢复并识别 → 记录解释 → 概念题 → 提交实验卡。7个单件观察素材含1个类别外省油灯。最多记录12次实验。学生可以比较不同器物，但完成任务要求同一器物按顺序完成一组对照。

评分为过程分：完整对照40分、三次预测20分、至少12字观察20分、概念题20分。文字仅检查完成度，不宣称自动理解解释质量。AI猜错不扣实验分。

## 真实模型与局限

MobileNet V1 0.50/224冻结视觉特征，加真实照片训练的线性softmax分类头，TensorFlow.js在浏览器本机推理。输入为画布实际处理后的像素，没有按文件编号或滑块预设结果。运行脚本、字体、照片、模型均打包本地。

36件实物训练，14件独立实物验证，原图正确10/14。增广只用于训练，同一实物不跨集合。有限验证不能代表实际文物识别准确率；分数未经概率校准。默认执壶是训练素材的实验演示，不用于报告泛化准确率。Met通用陶瓷训练图片不是邛窑文物。模型只有三类；省油灯等类别外器物仍会被分配三类分数。

照片来源：Kcx36 / Wikimedia Commons，CC BY-SA 4.0；本课件进行了单件裁切、缩放，学生还会进行图像处理。照片衍生图延续同许可。训练补充图来自The Metropolitan Museum of Art CC0开放资源。逐件来源、许可及训练验证分组见 `static/models/model-card.json` 和 `static/assets/specimens.json`。器物名称遵循照片来源，未虚构藏品编号或受损历史。

模型、TensorFlow.js：Apache-2.0。霞鹜文楷：OFL-1.1。纸纹为生成素材。相关许可随static目录交付。

## 平台保存

读取launchToken/platformApiBase/returnUrl；验证成功后STARTED，实验节点PROGRESS。完成时先上传PNG实验卡、TXT实验记录、JSON实验数据，再等待COMPLETED确认。失败锁定提交快照，支持重试并复用已上传附件；不会提前显示保存成功。没有身份认证时阻止正式互动；`?demo=1`显示本地预览且不保存成绩。

草稿保存在本浏览器、当前启动会话对应的本地存储中；不保存启动令牌或密码。完成后清除草稿。浏览器禁用存储时仍可在当前页面实验并导出。

## 开发与打包

在平台根目录 `npm ci` 后 `npm run build --prefix coursewares/qiong-ai-vision-challenge`。开发：`npm run dev --prefix coursewares/qiong-ai-vision-challenge -- --port <可用端口>`，仅监听127.0.0.1。

可重现数据处理：安装Pillow，运行 `scripts/prepare_data.py`，之后 `npm run train`。预训练模型使用 `scripts/fetch_model.py` 获取；作者采集脚本 `scripts/collect_training.py` 只在制作阶段联网。模型训练固定随机种子，权重与验证结果保存在public/models。

平台正式包：在干净提交运行根目录 `npm run coursewares:vision:package`。ZIP仅含manifest、README与static资源，不含依赖、训练中间产物、凭据、学生数据或Git信息。
