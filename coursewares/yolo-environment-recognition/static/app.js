(() => {
  const $ = (id) => document.getElementById(id);
  const names = ['人','自行车','汽车','摩托车','飞机','公交车','火车','卡车','船','红绿灯','消防栓','停车标志','停车计时器','长椅','鸟','猫','狗','马','羊','牛','大象','熊','斑马','长颈鹿','背包','雨伞','手提包','领带','行李箱','飞盘','滑雪板','滑雪橇','运动球','风筝','棒球棒','棒球手套','滑板','冲浪板','网球拍','瓶子','酒杯','杯子','叉子','刀','勺子','碗','香蕉','苹果','三明治','橙子','西兰花','胡萝卜','热狗','披萨','甜甜圈','蛋糕','椅子','沙发','盆栽','床','餐桌','厕所','电视','笔记本电脑','鼠标','遥控器','键盘','手机','微波炉','烤箱','烤面包机','水槽','冰箱','书','时钟','花瓶','剪刀','泰迪熊','吹风机','牙刷'];
  const video = $('video'), canvas = $('overlay'), ctx = canvas.getContext('2d');
  const prep = document.createElement('canvas'); prep.width = prep.height = 640;
  const px = prep.getContext('2d', { willReadFrequently: true });
  let session, stream, live = false, busy = false, frozen = false, boxes = [];
  const photos = [];
  function stopCamera() {
    live = false; stream?.getTracks().forEach((track) => track.stop()); stream = null; video.srcObject = null;
    $('run').disabled = true; $('photo').disabled = true; $('run').textContent = '开始实时识别';
  }
  function setReady() {
    $('camera').disabled = !session || frozen || busy;
    $('file').disabled = !session || frozen || busy || photos.length >= 3;
    $('run').disabled = !session || !stream || frozen || busy;
    $('photo').disabled = !session || !stream || frozen || busy || photos.length >= 3;
  }
  async function loadModel() {
    $('modelRetry').hidden = true;
    try {
      if (!window.ort) throw new Error('本地运行库加载失败');
      ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false;
      ort.env.wasm.wasmPaths = new URL('./vendor/', document.baseURI).href;
      session = await ort.InferenceSession.create(new URL('./models/yolov8n-int8.onnx', document.baseURI).href, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      $('status').textContent = '模型已就绪'; $('hint').textContent = '选择摄像头或上传图片'; setReady();
    } catch { $('status').textContent = '模型加载失败，请检查网络后重试'; $('hint').textContent = '模型未就绪'; $('modelRetry').hidden = false; }
  }
  function overlap(a, b) {
    const w = Math.max(0, Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x));
    const h = Math.max(0, Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
    return w*h / (a.w*a.h+b.w*b.h-w*h || 1);
  }
  async function infer(source) {
    const width = source.videoWidth || source.naturalWidth, height = source.videoHeight || source.naturalHeight;
    if (!width || !height) throw new Error('图像尚未就绪');
    const scale = Math.min(640/width,640/height), dx = (640-width*scale)/2, dy = (640-height*scale)/2;
    px.fillStyle = '#727272'; px.fillRect(0,0,640,640); px.drawImage(source,dx,dy,width*scale,height*scale);
    const pixels = px.getImageData(0,0,640,640).data, input = new Float32Array(3*640*640);
    for (let i=0; i<640*640; i++) { input[i]=pixels[i*4]/255; input[640*640+i]=pixels[i*4+1]/255; input[2*640*640+i]=pixels[i*4+2]/255; }
    const output = (await session.run({[session.inputNames[0]]:new ort.Tensor('float32',input,[1,3,640,640])}))[session.outputNames[0]];
    const [a,b] = output.dims.slice(-2), channels = Math.min(a,b), count = Math.max(a,b);
    if (channels !== 84) throw new Error('模型输出格式不匹配');
    const at = (c,i) => output.data[a===count?i*channels+c:c*count+i], candidates = [];
    for (let i=0;i<count;i++) {
      let p=0, label=0; for(let c=4;c<channels;c++) if(at(c,i)>p) { p=at(c,i); label=c-4; }
      if(p<.25) continue;
      const x=Math.max(0,(at(0,i)-at(2,i)/2-dx)/scale), y=Math.max(0,(at(1,i)-at(3,i)/2-dy)/scale);
      const w=Math.min(width,(at(0,i)+at(2,i)/2-dx)/scale)-x, h=Math.min(height,(at(1,i)+at(3,i)/2-dy)/scale)-y;
      if(w>0&&h>0) candidates.push({x,y,w,h,p,name:names[label]});
    }
    boxes=[]; for(const box of candidates.sort((a,b)=>b.p-a.p)) if(!boxes.some((other)=>other.name===box.name&&overlap(box,other)>.45)) boxes.push(box);
    boxes=boxes.slice(0,50);
    const ratio=Math.min(1,1280/width,960/height); canvas.width=Math.round(width*ratio); canvas.height=Math.round(height*ratio);
    ctx.drawImage(source,0,0,canvas.width,canvas.height);
    for(const box of boxes) {
      ctx.strokeStyle='#65efd1'; ctx.lineWidth=3; ctx.strokeRect(box.x*ratio,box.y*ratio,box.w*ratio,box.h*ratio);
      const label=`${box.name} ${Math.round(box.p*100)}%`; ctx.font='bold 18px sans-serif';
      const tx=Math.min(box.x*ratio,Math.max(0,canvas.width-ctx.measureText(label).width-12)), ty=Math.max(22,box.y*ratio);
      ctx.fillStyle='#082033';ctx.fillRect(tx,ty-22,ctx.measureText(label).width+12,24);ctx.fillStyle='#65efd1';ctx.fillText(label,tx+6,ty-4);
    }
    $('hint').textContent = boxes.length ? `检测到 ${boxes.length} 个目标` : '未检测到明确目标'; $('status').textContent = '识别完成';
  }
  async function loop() {
    if(!live||frozen||!stream) return;
    busy=true;setReady();
    try { await infer(video); } catch { live=false; $('status').textContent='实时识别失败，请重新开启摄像头'; }
    finally { busy=false; setReady(); }
    if(live) setTimeout(loop,250);
  }
  function addPhoto() {
    if(frozen||photos.length>=3) return;
    photos.push({data:canvas.toDataURL('image/jpeg',.85),detections:structuredClone(boxes)});
    renderPhotos(); window.ZhikeCourseware.progress('已添加识别作品');
  }
  function renderPhotos() {
    $('shots').replaceChildren();
    photos.forEach((photo,index)=>{
      const figure=document.createElement('figure');figure.className='shot';
      const img=document.createElement('img');img.src=photo.data;img.alt=`识别作品 ${index+1}`;
      const caption=document.createElement('figcaption');caption.textContent=photo.detections.map((box)=>box.name).join('、')||'未检测到明确目标';
      const remove=document.createElement('button');remove.textContent='移除';remove.disabled=frozen;
      remove.onclick=()=>{photos.splice(index,1);renderPhotos();};figure.append(img,caption,remove);$('shots').append(figure);
    });
    $('count').textContent=`作品图片 ${photos.length}/3`;setReady();
  }
  $('camera').onclick=async()=>{
    stopCamera(); busy=true; setReady();
    try {
      if(!navigator.mediaDevices?.getUserMedia) throw new Error('unavailable');
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
      if(frozen||document.hidden) {stopCamera();return;}
      video.srcObject=stream;await video.play();await infer(video);$('status').textContent='摄像头已开启';
    } catch {stopCamera();$('status').textContent='摄像头无法开启，请允许权限或改用上传图片';}
    finally {busy=false;setReady();}
  };
  $('run').onclick=()=>{live=!live;$('run').textContent=live?'停止实时识别':'开始实时识别';if(live)loop();};
  $('photo').onclick=async()=>{if(busy)return;busy=true;setReady();try{await infer(video);addPhoto();}catch{$('status').textContent='拍照识别失败，请重试';}finally{busy=false;setReady();}};
  $('file').onchange=async(event)=>{
    const file=event.target.files[0];event.target.value='';if(!file||frozen)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024){$('status').textContent='请选择小于 8 MB 的 JPG、PNG 或 WebP 图片';return;}
    stopCamera();busy=true;setReady();const url=URL.createObjectURL(file);
    try {const image=new Image();image.src=url;await image.decode();await infer(image);addPhoto();}
    catch{$('status').textContent='图片读取或识别失败，请换图重试';}
    finally {URL.revokeObjectURL(url);busy=false;setReady();}
  };
  $('submit').onclick=async()=>{
    if(busy){$('saveState').textContent='识别处理中，请稍后提交';return;}
    const answer=$('survey').value.trim();
    if(!photos.length||!answer){$('saveState').textContent='请至少添加一张作品图片，并填写本课问卷';return;}
    frozen=true;stopCamera();renderPhotos();$('survey').disabled=true;$('submit').disabled=true;$('saveState').textContent='正在上传作品和问卷…';
    const report={title:'环境物体识别',answer,photos:photos.map((item,index)=>({number:index+1,detections:item.detections})),evaluation:'待评价'};
    const bytes=new TextEncoder().encode(JSON.stringify(report,null,2));
    const base64=btoa(Array.from(bytes,(b)=>String.fromCharCode(b)).join(''));
    try {
      const result=await window.ZhikeCourseware.complete({score:null,brief:'识别作品和本课问卷已提交，等待评价。',
        resultItems:[{label:'作品图片',value:`${photos.length} 张`},{label:'评价状态',value:'未评分，待评价'}],
        pendingArtifacts:[...photos.map((item,index)=>({localId:`photo-${index}`,fileName:`识别作品-${index+1}.jpg`,mimeType:'image/jpeg',kind:'image',contentBase64:item.data.split(',')[1]})),
          {localId:'questionnaire',fileName:'环境识别问卷.json',mimeType:'application/json',kind:'report',contentBase64:base64}]});
      $('saveState').textContent=result.demo?'本地预览完成，作品和成绩不会保存':'作品和问卷已保存 · 未评分，等待评价';
      $('submit').textContent='已完成';$('returnPortal').hidden=Boolean(result.demo);
    } catch(error){$('saveState').textContent=`保存失败：${error.message}。请重试保存，已上传的作品不会重复上传。`;$('submit').textContent='重试保存';$('submit').disabled=false;}
  };
  $('returnPortal').onclick=()=>window.ZhikeCourseware.returnToPortal();$('modelRetry').onclick=loadModel;
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera();});window.addEventListener('pagehide',stopCamera);
  window.addEventListener('beforeunload',(event)=>{const state=window.ZhikeCourseware.state;if(!state.demo&&photos.length&&state.saveState!=='saved'){event.preventDefault();event.returnValue='';}});
  window.ZhikeCourseware.initialize().then(()=>{$('gate').hidden=true;$('lesson').hidden=false;loadModel();}).catch(()=>{$('gate').textContent='启动信息无效或已过期，请从学生后台重新进入';});
})();
