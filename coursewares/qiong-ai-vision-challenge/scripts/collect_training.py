"""Download official Met CC0 ceramics. Network only at authoring time; never at runtime."""
from pathlib import Path
import json, urllib.request, urllib.parse, time, re, hashlib
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'training'; DATA.mkdir(exist_ok=True)
def get(url):
    for i in range(3):
        try:
            return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'QiongVisionClassroom/1.0'}),timeout=25).read()
        except Exception:
            if i==2: raise
            time.sleep(2)
records=[]
for label,query in [('碗','bowl'),('罐','jar'),('壶','ewer')]:
    search=DATA/(query+'-search.json')
    if not search.exists():
        params=urllib.parse.urlencode({'hasImages':'true','title':'true','q':query,'departmentId':6,'limit':150})
        search.write_bytes(get('https://collectionapi.metmuseum.org/public/collection/v1.1/search?'+params))
    ids=json.loads(search.read_text()).get('objectIDs') or []
    count=0
    for oid in ids:
        meta=DATA/(str(oid)+'.json')
        if not meta.exists():
            try: meta.write_bytes(get('https://collectionapi.metmuseum.org/public/collection/v1/objects/'+str(oid)))
            except Exception: continue
        m=json.loads(meta.read_text()); title=m.get('title',''); medium=m.get('medium','')
        if not m.get('isPublicDomain') or not m.get('primaryImageSmall') or not re.search(r'porcelain|stoneware|earthenware|ceramic',medium,re.I): continue
        if re.search(r'ritual|incense|buddh|relig|tomb|funerar|fragment|sherd|lid only|covered bowl|pair|two |three ',title+' '+m.get('objectName',''),re.I): continue
        # Labels are based on the museum's explicit title, not search ranking.
        if not re.match(r'^'+query+r'\b', title, re.I): continue
        img=DATA/(str(oid)+'.jpg')
        if not img.exists(): img.write_bytes(get(m['primaryImageSmall']))
        count+=1
        records.append({'id':'met-'+str(oid),'group':'met-'+str(oid),'label':label,'title':title,'medium':medium,'source':m['objectURL'],'imageUrl':m['primaryImageSmall'],'license':'CC0','licenseUrl':'https://creativecommons.org/publicdomain/zero/1.0/','author':'The Metropolitan Museum of Art','file':str(oid)+'.jpg','split':'test' if count%4==0 else 'train','sha256':hashlib.sha256(img.read_bytes()).hexdigest()})
        print(label,count,oid,title,flush=True)
        if count>=16: break
    if count<8: raise RuntimeError('Too few curated '+query+' samples: '+str(count))
(DATA/'catalog.json').write_text(json.dumps(records,ensure_ascii=False,indent=2))
print('Downloaded',len(records),'independent objects',flush=True)
