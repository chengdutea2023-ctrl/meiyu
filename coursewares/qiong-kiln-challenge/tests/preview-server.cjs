/* Isolated browser contract test server. No accounts or real platform data. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../static');
const stats = { started: 0, progress: 0, uploads: [], completedAttempts: 0, completed: 0, final: null };
const server = http.createServer(async (req,res)=>{
  const url = new URL(req.url,'http://test.invalid');
  const json=(data,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
  if(url.pathname==='/test-stats')return json(stats);
  if(url.pathname.startsWith('/test-api/')){
    let raw='';for await(const part of req)raw+=part;
    let body;try{body=JSON.parse(raw);}catch{return json({},400);}
    if(body.launchToken!=='test-only')return json({message:'测试入口已过期'},401);
    if(url.pathname.endsWith('/verify'))return json({context:{}});
    if(url.pathname.endsWith('/artifacts')){stats.uploads.push(body.fileName);return json({url:'/test-artifact/'+encodeURIComponent(body.fileName),kind:body.kind,mimeType:body.mimeType,originalFileName:body.fileName});}
    if(body.status==='STARTED')stats.started++;
    if(body.status==='PROGRESS')stats.progress++;
    if(body.status==='COMPLETED'){
      stats.completedAttempts++;
      if(stats.completedAttempts===1)return json({message:'测试模拟保存失败'},503);
      stats.completed++;stats.final={score:body.score,durationSeconds:body.durationSeconds,summary:body.summary};
    }
    return json({});
  }
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root+path.sep))return json({},403);
  const mime={'.html':'text/html;charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream';
  try{const data=fs.readFileSync(file);res.writeHead(200,{'content-type':mime});res.end(data);}catch{res.writeHead(404);res.end('Not found');}
});
server.listen(4197,'127.0.0.1',()=>process.stdout.write('Isolated browser test server: 127.0.0.1:4197\n'));
