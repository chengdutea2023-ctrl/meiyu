from pathlib import Path
from PIL import Image, ImageOps, ImageFilter
import json, random, hashlib
ROOT=Path(__file__).resolve().parents[1]; DATA=ROOT/'training'; ASSETS=ROOT/'public/assets'
SOURCE=DATA/'qiong-originals'
source=json.loads((SOURCE/'catalog.json').read_text())['items']
byid={s['id']:s for s in source}
specs=[
 ('qiong-ewer','hu-02','邛窑褐彩执壶','壶',None,'train','壶流与把手'),
 ('qiong-jar-green','guan-02','邛窑绿彩四系罐','罐',(0,0,1686,1450),'train','器口、鼓腹与系耳'),
 ('qiong-jar-tall','guan-01','邛窑四系罐','罐',(80,60,1630,2080),'test','器口与圆腹'),
 ('qiong-bowl-yellow','wan-01','邛窑瓷碗（左）','碗',(5,40,1190,1160),'train','敞口与碗腹'),
 ('qiong-bowl-brown','wan-01','邛窑瓷碗（中）','碗',(1220,220,2260,1140),'test','敞口与内壁'),
 ('qiong-bowl-grey','wan-01','邛窑瓷碗（右）','碗',(2280,120,3417,1150),'test','敞口与碗腹'),
 ('qiong-lamp','extra-02','邛窑省油灯','类别外',(0,0,1456,1550),'outside','不能仅按外形认作碗'),
]
runtime=[];qiong=[]
for key,sid,name,label,crop,split,features in specs:
 s=byid[sid];im=Image.open(SOURCE/s['localFile']).convert('RGB')
 if crop:im=im.crop(crop)
 im.thumbnail((900,800));file=key+'.jpg';im.save(ASSETS/file,quality=91)
 item={'id':key,'group':key,'name':name,'title':s['name'],'label':label,'file':file,'split':split,'features':features,'source':s['sourcePage'],'author':s['photographer'],'license':s['license'],'licenseUrl':s['licenseUrl'],'modified':'单件裁切与缩放；无生成式重绘','challenge':split=='outside'}
 runtime.append(item)
 if split!='outside':qiong.append({**item,'file':'../public/assets/'+file})
# Keep authored descriptions and additional observation objects separate from model training.
notes=json.loads((ASSETS/'specimen-notes.json').read_text())
runtime=[{**item,**notes.get(item['id'],{})} for item in runtime]
runtime+=json.loads((ASSETS/'additional-specimens.json').read_text())
(ASSETS/'specimens.json').write_text(json.dumps(runtime,ensure_ascii=False,indent=2)+'\n')
catalog=json.loads((DATA/'catalog.json').read_text())
exclusions={'met-37405':'侧视外形边界不清','met-50885':'同照两件器物','met-39609':'图像缺少完整壶流，器型边界不清','met-853980':'避开宗教神兽装饰'}
catalog=[s for s in catalog if s['id'] not in exclusions]+qiong
(DATA/'curated.json').write_text(json.dumps({'exclusions':exclusions,'items':catalog},ensure_ascii=False,indent=2))
output=DATA/'processed';output.mkdir(exist_ok=True)
rng=random.Random(20261021);manifest=[]
for s in catalog:
 im=Image.open(DATA/s['file']).convert('RGB')
 for a in range(7 if s['split']=='train' else 1):
  target=Image.new('RGB',(768,512),'#f7f3ec');scale=.84 if a==0 else rng.uniform(.73,.91)
  fitted=ImageOps.contain(im,(int(768*scale),int(512*scale)),Image.Resampling.LANCZOS)
  if a in [1,2]:fitted=fitted.rotate([-12,12][a-1],resample=Image.Resampling.BICUBIC,expand=True,fillcolor='#f7f3ec')
  target.paste(fitted,((768-fitted.width)//2,(512-fitted.height)//2))
  if a==3:target=target.filter(ImageFilter.GaussianBlur(1.5))
  if a==4:target=ImageOps.mirror(target)
  if a==5:target=ImageOps.autocontrast(target,cutoff=1)
  # No synthetic occlusion in this first model; occlusion is a robustness experiment.
  target=target.resize((224,224),Image.Resampling.BILINEAR);name=s['id']+'-'+str(a)+'.jpg';target.save(output/name,quality=95)
  manifest.append({'file':name,'id':s['id'],'group':s['group'],'label':s['label'],'split':s['split']})
(output/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False))
print('Prepared',len(catalog),'objects;',len(manifest),'frames. Train/test groups disjoint.')
