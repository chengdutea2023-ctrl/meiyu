/* Offline global migration classroom. All bundled routes are teaching simulations. */
(() => {
  'use strict';
  const MAX_POINTS = 1000, W = 1080, H = 540;
  let STORAGE;
  const presets = [
    {id:'east-asia',title:'东亚湿地迁徙',subtitle:'西伯利亚 → 东北湿地 → 鄱阳湖',tag:'5 个观测点 · 沿陆地与湿地南迁',species:'水鸟（教学模拟）',season:'秋季南迁',points:[
      ['西伯利亚',65,125,'高纬度起点'],['扎龙湿地',47.2,124.2,'湿地补给'],['渤海湾',39,118,'河口停歇'],['长江中下游',31.5,118,'沿江停歇'],['鄱阳湖',29.1,116,'湖泊越冬示意']
    ]},
    {id:'pacific',title:'跨太平洋迁徙',subtitle:'阿拉斯加 → 太平洋 → 新西兰',tag:'5 个观测点 · 跨越 180° 经线',species:'涉禽（教学模拟）',season:'秋季南迁',points:[
      ['阿拉斯加',64,-165,'出发地'],['北太平洋',40,-175,'海上观测'],['中太平洋',12,178,'海上观测'],['南太平洋',-18,176,'海上观测'],['新西兰',-37,174.8,'抵达地']
    ]},
    {id:'polar',title:'两极间的长途旅程',subtitle:'格陵兰 → 大西洋 → 南极周边',tag:'7 个观测点 · 跨赤道、跨半球',species:'北极燕鸥（教学模拟）',season:'跨季节 / 自定义',points:[
      ['格陵兰周边',68,-45,'北极区域起点'],['北大西洋',38,-25,'海上观测'],['西非外海',14,-20,'海上觅食示意'],['南大西洋',-15,-10,'跨赤道后观测'],['南非外海',-36,18,'南端外海'],['南大洋',-58,40,'高纬度海域'],['南极周边',-68,30,'南极区域终点']
    ]}
  ];
  const pointObjects = p => p.points.map(([name,lat,lon,kind])=>({name,lat,lon,kind}));
  const escapeHTML = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const project = p => [(p.lon+180)*3,(90-p.lat)*3];
  const rad = x=>x*Math.PI/180, deg=x=>x*180/Math.PI;
  const wrapLon = x=>((x+180)%360+360)%360-180;
  function haversine(a,b) {
    const q=Math.sin(rad(b.lat-a.lat)/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lon-a.lon)/2)**2;
    return 12742*Math.asin(Math.sqrt(Math.max(0,Math.min(1,q))));
  }
  function distance(points) { return points.slice(1).reduce((sum,p,n)=>sum+haversine(points[n],p),0); }
  // Densify the shortest great-circle arc; split at the map seam instead of drawing across the world.
  function greatCircle(a,b) {
    const vec=p=>[Math.cos(rad(p.lat))*Math.cos(rad(p.lon)),Math.cos(rad(p.lat))*Math.sin(rad(p.lon)),Math.sin(rad(p.lat))];
    const u=vec(a),v=vec(b),omega=Math.acos(Math.max(-1,Math.min(1,u.reduce((s,x,n)=>s+x*v[n],0))));
    const count=Math.max(2,Math.ceil(deg(omega)/3)),result=[];
    for(let j=0;j<=count;j++){
      const t=j/count;
      if(Math.abs(Math.sin(omega))<1e-7){result.push({lat:a.lat+(b.lat-a.lat)*t,lon:wrapLon(a.lon+wrapLon(b.lon-a.lon)*t)});continue;}
      const c=Math.sin((1-t)*omega)/Math.sin(omega),d=Math.sin(t*omega)/Math.sin(omega);
      const xyz=u.map((x,n)=>c*x+d*v[n]);
      result.push({lat:deg(Math.atan2(xyz[2],Math.hypot(xyz[0],xyz[1]))),lon:deg(Math.atan2(xyz[1],xyz[0]))});
    }
    return result;
  }
  function routePath(points) {
    if(points.length<2)return '';
    let path='',previous=null;
    for(let n=1;n<points.length;n++){
      for(const p of greatCircle(points[n-1],points[n])){
        const [x,y]=project(p);
        if(!previous){path+='M'+x.toFixed(2)+','+y.toFixed(2);}
        else if(Math.abs(x-previous[0])>W/2){
          const right=previous[0]>W/2,unwrapped=x+(right?W:-W),edge=right?W:0;
          const t=(edge-previous[0])/(unwrapped-previous[0]),ey=previous[1]+t*(y-previous[1]);
          path+='L'+edge+','+ey.toFixed(2)+'M'+(right?0:W)+','+ey.toFixed(2)+'L'+x.toFixed(2)+','+y.toFixed(2);
        }else{path+='L'+x.toFixed(2)+','+y.toFixed(2);}
        previous=[x,y];
      }
    }
    return path;
  }
  function validPoint(p) {
    return p && typeof p.name==='string' && p.name.trim() && p.name.length<=80 &&
      Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat)<=90 && Math.abs(p.lon)<=180 &&
      typeof p.kind==='string' && p.kind.length<=120;
  }
  function parseRows(text) {
    text=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
    const first=text.split('\n').find(x=>x.trim())||'';
    let delim=first.includes('\t')?'\t':first.includes(',')?',':first.includes('，')?'，':first.includes(';')?';':null;
    if(!delim)throw Error('请用逗号或制表符分隔列，也可以直接复制 Excel 的多列数据。');
    const rows=[];let cells=[],cell='',quoted=false,line=1,start=1,closed=false;
    const pushRow=()=>{cells.push(cell.trim());if(cells.some(x=>x!==''))rows.push({cells,line:start});cells=[];cell='';closed=false;start=line+1;};
    for(let n=0;n<text.length;n++){
      const c=text[n];
      if(c==='"'){
        if(quoted && text[n+1]==='"'){cell+='"';n++;}
        else if(quoted){quoted=false;closed=true;}
        else if(!cell.trim() && !closed){quoted=true;cell='';}
        else throw Error('第 '+line+' 行引号格式有误。包含逗号的地点名请放在双引号中。');
      }else if(!quoted && c===delim){cells.push(cell.trim());cell='';closed=false;}
      else if(!quoted && c==='\n'){pushRow();line++;}
      else{if(closed && c.trim())throw Error('第 '+line+' 行引号后有多余内容。');cell+=c;if(c==='\n')line++;}
    }
    if(quoted)throw Error('CSV 的双引号未闭合，请检查最后一列。');
    pushRow();return rows;
  }
  function parseBatch(text) {
    if(!text.trim())throw Error('请先粘贴坐标或选择文件。');
    const rows=parseRows(text);
    if(!rows.length)throw Error('没有可导入的坐标。');
    const normalize=x=>x.trim().toLowerCase().replace(/[\s_()（）°]/g,'');
    const aliases={lat:['lat','latitude','纬度'],lon:['lon','lng','long','longitude','经度'],name:['name','地点','地名','名称','地点名称','站点'],kind:['kind','type','note','标注','备注','类型','习性']};
    const head=rows[0].cells.map(normalize),find=k=>head.findIndex(x=>aliases[k].includes(x));
    const latIndex=find('lat'),lonIndex=find('lon');
    let start=0,index={name:0,lat:1,lon:2,kind:3},expected=null;
    if(latIndex>=0 || lonIndex>=0){
      if(latIndex<0 || lonIndex<0)throw Error('表头必须同时包含「纬度 / lat」和「经度 / lon」。');
      if(head.filter(x=>aliases.lat.includes(x)).length!==1||head.filter(x=>aliases.lon.includes(x)).length!==1)throw Error('经纬度表头重复，请只保留一列纬度、一列经度。');
      index={name:find('name'),lat:latIndex,lon:lonIndex,kind:find('kind')};start=1;expected=head.length;
    }else if(rows[0].cells.length===2){index={name:-1,lat:0,lon:1,kind:-1};expected=2;}
    else if(rows[0].cells.length<3 || rows[0].cells.length>4)throw Error('无表头时请使用「地点,纬度,经度,标注」，或两列「纬度,经度」。');
    if(rows.length-start<1)throw Error('只有表头，还没有坐标行。');
    if(rows.length-start>MAX_POINTS)throw Error('一次最多导入 1,000 个点，请拆分数据。');
    return rows.slice(start).map(({cells,line},n)=>{
      if(expected!==null ? cells.length!==expected : cells.length<3||cells.length>4)throw Error('第 '+line+' 行列数不正确，请检查分隔符。');
      const get=k=>index[k]>=0 ? (cells[index[k]]||'') : '';
      const number=(value,label,limit)=>{
        const clean=value.replace(/−/g,'-');
        if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(clean))throw Error('第 '+line+' 行'+label+'不是十进制数字：'+value);
        const x=Number(clean);if(!Number.isFinite(x)||Math.abs(x)>limit)throw Error('第 '+line+' 行'+label+'超出范围（−'+limit+'～'+limit+'）。');
        return x;
      };
      const p={name:get('name')||'观测点 '+(n+1),lat:number(get('lat'),'纬度',90),lon:number(get('lon'),'经度',180),kind:get('kind')||'观测点'};
      if(!validPoint(p))throw Error('第 '+line+' 行地点名最多 80 字、标注最多 120 字。');return p;
    });
  }
  const csvCell=s=>'"'+String(s).replace(/"/g,'""')+'"';
  function toCsv(points) {return '\uFEFF地点,纬度,经度,标注\r\n'+points.map(p=>[p.name,p.lat,p.lon,p.kind].map(csvCell).join(',')).join('\r\n');}
  if(typeof module!=='undefined' && module.exports){module.exports={presets,pointObjects,parseBatch,toCsv,haversine,distance,routePath,greatCircle,project};return;}
  const $=id=>document.getElementById(id);
  let data=pointObjects(presets[0]),source='教学模拟 · 东亚湿地迁徙',i=0,timer=null;
  let zoom=1,tx=0,ty=0,selectedPreset='east-asia',drag=null,fileRevision=0,reportReady=false;
  const reportPlaceholder='报告将整理当前路线、GPS 距离、地点标注，以及你的模拟条件和推理。';
  function invalidateReport() {reportReady=false;$('generate').disabled=false;$('downloadReport').disabled=true;$('report').textContent=reportPlaceholder;}
  function showToast(message,error=false){$('toast').textContent=message;$('toast').classList.toggle('error',error);}
  function save(){
    try{localStorage.setItem(STORAGE,JSON.stringify({data,source,species:$('species').value,season:$('season').value,reason:$('reason').value,wind:$('wind').value,weather:$('weather').value}));$('saveStatus').textContent='已自动保存在当前浏览器。换设备使用时请导出 CSV。';}
    catch{$('saveStatus').textContent='当前浏览器无法自动保存，请导出 CSV 留存。';}
  }
  function restore(){
    try{
      const x=JSON.parse(localStorage.getItem(STORAGE)||'null');
      if(!x || !Array.isArray(x.data) || x.data.length<1 || x.data.length>MAX_POINTS || !x.data.every(validPoint))return false;
      data=x.data;source=typeof x.source==='string'?x.source:'教师数据';
      for(const id of ['species','season','reason','wind','weather'])if(typeof x[id]==='string')$(id).value=x[id];
      showToast('已恢复上次保存在此浏览器的路线。');return true;
    }catch{return false;}
  }
  const coord=p=>Math.abs(p.lat).toFixed(2)+'°'+(p.lat>=0?'N':'S')+' · '+Math.abs(p.lon).toFixed(2)+'°'+(p.lon>=0?'E':'W');
  function direction(){if(data.length<2)return '单点';const change=data.at(-1).lat-data[0].lat;return Math.abs(change)<.01?'基本同纬度':change>0?'向北':'向南';}
  function stopPlayback(){clearInterval(timer);timer=null;$('play').textContent='▶ 播放轨迹';}
  function markerSvg(){
    const radius=4/zoom;
    $('points').innerHTML=data.map((p,n)=>{const [x,y]=project(p);return '<circle cx="'+x+'" cy="'+y+'" r="'+radius+'" fill="#ffe2a7" stroke="#153d4b" stroke-width="1" vector-effect="non-scaling-stroke"><title>'+escapeHTML((n+1)+'. '+p.name+' · '+coord(p))+'</title></circle>';}).join('');
    const p=data[i],[x,y]=project(p),anchor=x>W-160/zoom?'end':'start',dx=anchor==='end'?-12/zoom:12/zoom;
    $('currentPoint').innerHTML='<circle cx="'+x+'" cy="'+y+'" r="'+(8/zoom)+'" fill="#75e7c8" stroke="#fff" stroke-width="2" vector-effect="non-scaling-stroke"/><text x="'+(x+dx)+'" y="'+(y<24/zoom?y+25/zoom:y-13/zoom)+'" text-anchor="'+anchor+'" fill="#fff" stroke="#123b4b" stroke-width="'+(3/zoom)+'" paint-order="stroke" font-size="'+(15/zoom)+'" font-weight="700">'+escapeHTML(p.name)+'</text>';
  }
  function transform(){
    tx=Math.max(W-W*zoom,Math.min(0,tx));ty=Math.max(H-H*zoom,Math.min(0,ty));
    $('world').setAttribute('transform','translate('+tx+' '+ty+') scale('+zoom+')');
    markerSvg();$('zoomIn').disabled=zoom>=10;$('zoomOut').disabled=zoom<=1;
  }
  function zoomAt(next,cx=W/2,cy=H/2){
    next=Math.min(10,Math.max(1,next));const ratio=next/zoom;
    tx=cx-(cx-tx)*ratio;ty=cy-(cy-ty)*ratio;zoom=next;transform();
  }
  function resetMap(){zoom=1;tx=ty=0;transform();}
  function fitRoute(){
    let pts=data.flatMap((p,n)=>n?greatCircle(data[n-1],p):[p]).map(project);
    const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
    zoom=Math.max(1,Math.min(8,(W-130)/Math.max(45,right-left),(H-120)/Math.max(35,bottom-top)));
    tx=W/2-(left+right)/2*zoom;ty=H/2-(top+bottom)/2*zoom;transform();
  }
  function renderStops(){
    $('stops').innerHTML=data.map((p,n)=>'<div class="stop'+(n===i?' active':'')+'"><button class="stop-go" data-index="'+n+'" aria-label="'+escapeHTML('查看第 '+(n+1)+' 点 '+p.name)+'"><b>'+escapeHTML((n+1)+'. '+p.name)+'</b><small>'+escapeHTML(coord(p)+' · '+p.kind)+'</small></button><button class="remove" data-remove="'+n+'" aria-label="'+escapeHTML('移除 '+p.name)+'"'+(data.length===1?' disabled':'')+'>×</button></div>').join('');
  }
  function render(){
    i=Math.min(i,data.length-1);const p=data[i];
    $('route').setAttribute('d',routePath(data));$('traveled').setAttribute('d',routePath(data.slice(0,i+1)));
    $('timeline').max=data.length-1;$('timeline').value=i;$('timeline').disabled=data.length<2;
    $('station').textContent=(i+1)+' / '+data.length;$('distance').textContent=Math.round(distance(data)).toLocaleString()+' km';$('bearing').textContent=direction();
    $('routeText').textContent=(i+1)+'. '+p.name;$('pointInfo').textContent=coord(p)+'  ·  '+p.kind;
    $('pointCount').textContent=data.length;$('sourceBadge').textContent=source;
    $('prev').disabled=i===0;$('next').disabled=i===data.length-1;$('play').disabled=data.length<2;
    markerSvg();renderStops();
  }
  function dataChanged(){stopPlayback();invalidateReport();render();save();validateImport();}
  function move(index){i=Math.max(0,Math.min(data.length-1,index));render();}
  function drawBase(){
    if(!window.BIRD_LAND_PATH){$('mapError').hidden=false;$('mapError').textContent='地图文件未加载，请刷新页面，或确认 world-land.js 和课件放在同一文件夹。';}
    else $('land').setAttribute('d',window.BIRD_LAND_PATH);
    let grid='';
    for(let lon=-150;lon<=150;lon+=30){const x=(lon+180)*3;grid+='<path d="M'+x+',0V540" stroke="#779b9c" opacity=".22" stroke-width=".5" vector-effect="non-scaling-stroke"/><text x="'+(x+3)+'" y="284" fill="#8eafac" font-size="9">'+Math.abs(lon)+'°'+(lon<0?'W':lon>0?'E':'')+'</text>';}
    for(let lat=-60;lat<=60;lat+=30){const y=(90-lat)*3;grid+='<path d="M0,'+y+'H1080" stroke="#a4c6c0" opacity="'+(lat===0?.45:.2)+'" stroke-width="'+(lat===0?1:.5)+'" vector-effect="non-scaling-stroke"/><text x="5" y="'+(y-5)+'" fill="#a9c8c1" font-size="9">'+(lat===0?'赤道':Math.abs(lat)+'°'+(lat>0?'N':'S'))+'</text>';}
    $('graticule').innerHTML=grid;
    const labels=[['北美洲',-105,45],['南美洲',-62,-15],['欧洲',20,53],['非洲',20,9],['亚洲',90,44],['大洋洲',135,-25],['南极洲',0,-79],['太平洋',-135,0],['大西洋',-35,12],['印度洋',78,-20]];
    $('geographicLabels').innerHTML=labels.map(([name,lon,lat])=>{const [x,y]=project({lat,lon});return '<text x="'+x+'" y="'+y+'" fill="#b7d0be" font-size="12" opacity=".75" text-anchor="middle" pointer-events="none">'+name+'</text>';}).join('');
  }
  function showTab(name,focus=false){
    for(const b of document.querySelectorAll('[data-tab]')){const active=b.dataset.tab===name;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;$('panel-'+b.dataset.tab).hidden=!active;if(active&&focus)b.focus();}
  }
  function validateImport(){
    $('importBatch').disabled=true;$('importPreview').classList.remove('error');
    if(!$('batchText').value.trim()){$('importPreview').textContent='粘贴坐标后，会在这里检查格式与数量。';return;}
    try{
      const p=parseBatch($('batchText').value),append=$('importMode').value==='append';
      if(p.length+(append?data.length:0)>MAX_POINTS)throw Error('当前路线加上新数据超过 1,000 个点，请选择替换或减少数据。');
      $('importPreview').textContent='已识别 '+p.length+' 个有效点：'+p[0].name+' → '+p.at(-1).name+'\n'+(append?'将追加到当前路线末尾。':'将替换当前 '+data.length+' 个点。');
      $('importBatch').disabled=false;
    }catch(e){$('importPreview').textContent=e.message;$('importPreview').classList.add('error');}
  }
  function download(name,text,type){
    const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  $('presetCards').innerHTML=presets.map((p,n)=>'<label class="preset-choice"><input type="radio" name="preset" value="'+p.id+'"'+(n===0?' checked':'')+'><span><strong>'+p.title+'</strong><small>'+p.subtitle+'</small><span class="tag">'+p.tag+'</span></span></label>').join('');
  $('presetCards').addEventListener('change',e=>{selectedPreset=e.target.value;});
  $('loadPreset').onclick=()=>{
    const p=presets.find(p=>p.id===selectedPreset);data=pointObjects(p);source='教学模拟 · '+p.title;i=0;$('species').value=p.species;$('season').value=p.season;
    dataChanged();resetMap();showToast('已载入 '+p.title+'，共 '+data.length+' 个教学模拟点。');
  };
  for(const b of document.querySelectorAll('[data-tab]')){
    b.onclick=()=>showTab(b.dataset.tab);
    b.onkeydown=e=>{const names=['presets','import','single'],n=names.indexOf(b.dataset.tab);if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();showTab(e.key==='Home'?names[0]:e.key==='End'?names[2]:names[(n+(e.key==='ArrowRight'?1:2))%3],true);}};
  }
  $('batchText').oninput=()=>{fileRevision++;validateImport();};$('importMode').onchange=validateImport;
  $('csvFile').onchange=async()=>{
    const file=$('csvFile').files[0],revision=++fileRevision;if(!file)return;
    if(file.size>1024*1024){showToast('文件超过 1 MB，请减少到 1,000 个坐标点以内。',true);return;}
    try{const text=await file.text();if(revision!==fileRevision)return;if(text.includes('\uFFFD'))throw Error('文件编码无法识别，请在 Excel 中另存为 CSV UTF-8。');$('batchText').value=text;validateImport();showToast('已读取 '+file.name+'，检查预览后点击导入。');}catch(e){showToast(e.message||'无法读取文件，请重新选择。',true);}
    finally{$('csvFile').value='';}
  };
  const example=[{name:'鄱阳湖',lat:29.1,lon:116,kind:'湖泊补给'},{name:'杭州湾',lat:30.2,lon:121.8,kind:'河口停歇'},{name:'渤海湾',lat:39,lon:118,kind:'沿海湿地'}];
  $('fillExample').onclick=()=>{fileRevision++;$('batchText').value=toCsv(example).replace(/^\uFEFF/,'');validateImport();showToast('已填入教学模拟示例，点击导入后生效。');};
  $('downloadTemplate').onclick=()=>download('候鸟GPS导入模板.csv',toCsv(example),'text/csv;charset=utf-8');
  $('importBatch').onclick=()=>{
    try{
      const p=parseBatch($('batchText').value),append=$('importMode').value==='append';
      if(p.length+(append?data.length:0)>MAX_POINTS)throw Error('路线不能超过 1,000 个点。');
      const wasSimulated=source.includes('教学模拟');data=append?data.concat(p):p;
      source=append&&wasSimulated?'教学模拟 + 教师补充':'教师导入 · 来源待核验';i=0;
      if(!append){$('species').value='待填写';$('season').value='跨季节 / 自定义';}
      dataChanged();resetMap();showToast('成功导入 '+p.length+' 个点，路线与距离已更新。');
    }catch(e){showToast(e.message,true);}
  };
  $('add').onclick=()=>{
    const name=$('pointName').value.trim(),kind=$('pointKind').value.trim()||'观测点',lat=Number($('pointLat').value),lon=Number($('pointLon').value);
    const p={name,kind,lat,lon};
    if(!$('pointLat').value.trim()||!$('pointLon').value.trim()||!validPoint(p)){showToast('请填写地点及有效的经纬度：纬度 −90～90，经度 −180～180。',true);return;}
    if(data.length>=MAX_POINTS){showToast('最多保留 1,000 个点。',true);return;}
    data.push(p);source=source.includes('教学模拟')?'教学模拟 + 教师补充':'教师录入 · 来源待核验';i=data.length-1;
    dataChanged();resetMap();for(const id of ['pointName','pointLat','pointLon','pointKind'])$(id).value='';showToast('已添加 '+name+'。');
  };
  $('stops').onclick=e=>{
    const remove=e.target.closest('[data-remove]'),go=e.target.closest('[data-index]');
    if(remove&&data.length>1){const n=Number(remove.dataset.remove),name=data[n].name;data.splice(n,1);i=Math.min(i,data.length-1);dataChanged();showToast('已移除 '+name+'。');}
    else if(go){stopPlayback();move(Number(go.dataset.index));}
  };
  $('exportCsv').onclick=()=>download('候鸟GPS当前路线.csv',toCsv(data),'text/csv;charset=utf-8');
  $('timeline').oninput=e=>{stopPlayback();move(Number(e.target.value));};
  $('prev').onclick=()=>{stopPlayback();move(i-1);};$('next').onclick=()=>{stopPlayback();move(i+1);};
  $('play').onclick=()=>{if(timer){stopPlayback();return;}if(i===data.length-1)move(0);$('play').textContent='Ⅱ 暂停';timer=setInterval(()=>{move(i+1);if(i===data.length-1)stopPlayback();},900);};
  $('zoomIn').onclick=()=>zoomAt(zoom*1.5);$('zoomOut').onclick=()=>zoomAt(zoom/1.5);$('resetMap').onclick=resetMap;$('fitRoute').onclick=fitRoute;
  const svg=$('mapSvg');
  const svgPoint=e=>{const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(svg.getScreenCTM().inverse());};
  svg.addEventListener('wheel',e=>{e.preventDefault();const p=svgPoint(e);zoomAt(zoom*(e.deltaY<0?1.15:1/1.15),p.x,p.y);},{passive:false});
  svg.addEventListener('pointerdown',e=>{if(e.button!==0)return;const p=svgPoint(e);drag={id:e.pointerId,x:p.x,y:p.y,tx,ty};svg.setPointerCapture(e.pointerId);});
  svg.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;const p=svgPoint(e);tx=drag.tx+p.x-drag.x;ty=drag.ty+p.y-drag.y;transform();});
  svg.addEventListener('pointerup',()=>{drag=null;});svg.addEventListener('pointercancel',()=>{drag=null;});
  svg.onkeydown=e=>{if(['+','=','-','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','0'].includes(e.key)){e.preventDefault();if(e.key==='0')resetMap();else if(e.key==='+'||e.key==='=')zoomAt(zoom*1.5);else if(e.key==='-')zoomAt(zoom/1.5);else{tx+=e.key==='ArrowLeft'?45:e.key==='ArrowRight'?-45:0;ty+=e.key==='ArrowUp'?45:e.key==='ArrowDown'?-45:0;transform();}}};
  for(const id of ['species','season','reason','wind','weather'])$(id).addEventListener('input',()=>{invalidateReport();save();});
  $('submit').onclick=()=>{save();$('feedback').textContent=$('reason').value.trim()?'推理已保存，将带入科学报告。':'请先写下你的证据与推理。';};
  $('generate').onclick=async()=>{
    const notes=data.map((p,n)=>(n+1)+'. '+p.name+'（'+coord(p)+'）：'+p.kind).join('\n');
    const r=$('reason').value.trim()||'尚未填写，需结合地点标注补充证据。';
    const report='候鸟迁徙科学报告\n\n研究对象：'+($('species').value.trim()||'待填写')+'\n观察季节：'+$('season').value+'\n数据来源：'+source+'\nGPS 观测点：'+data.length+' 个\n相邻点大圆距离之和：约 '+Math.round(distance(data)).toLocaleString()+' km\n起终点纬度变化：'+direction()+'\n\n地点与标注\n'+notes+'\n\n模拟条件\n'+$('wind').value+'；'+$('weather').value+'。这些条件是课堂设定，未与实测气象记录匹配。\n\n我的证据与推理\n'+r+'\n\n过程评分（100 分）\n路线数据：最高 30 分，至少两个有效观测点得满分；单点得 15 分。\n物种与季节信息：各 10 分，填写后计分。\n地点生态标注：最高 20 分，按填写有效标注的点数比例计分。\n证据推理：最高 30 分，按推理文字长度分档；建议结合地点、坐标与环境说明证据。\n\n方法与局限\n按输入顺序连接 GPS 点并估算大圆距离；没有连续定位与时间信息，不能据此推算真实完整航程或飞行速度。教学模拟点不作为真实动物追踪证据。\n\n下一步研究\n补充时间戳、真实追踪记录和栖息地证据，比较不同地点的停歇原因，再形成结论。';
    $('report').textContent=report;
    reportReady=true;$('downloadReport').disabled=false;
    $('generate').disabled=true;
    const saved=await window.ZhikeCourseware.complete({
      report,points:data.map(p=>({...p})),species:$('species').value,season:$('season').value,reason:r,
      distanceKm:Math.round(distance(data)).toLocaleString(),
    });
  };
  $('downloadReport').onclick=()=>{if(reportReady)download('候鸟迁徙科学报告.txt',$('report').textContent,'text/plain;charset=utf-8');};
  function startCourseware(){
    STORAGE = window.ZhikeCourseware.storageKey;
    if(!restore()){$('species').value=presets[0].species;$('season').value=presets[0].season;}
    drawBase();render();transform();
  }
  window.ZhikeCourseware.ready().then(ok=>{if(ok)startCourseware();});
  window.addEventListener('zhike:ready',startCourseware);
})();
