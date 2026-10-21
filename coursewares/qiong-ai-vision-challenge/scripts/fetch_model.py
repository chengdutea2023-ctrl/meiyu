from pathlib import Path
import json, urllib.request, hashlib
ROOT=Path(__file__).resolve().parents[1]/'public/models'
base='https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.50_224/'
m=json.loads((ROOT/'model.json').read_text())
for name in [p for g in m['weightsManifest'] for p in g['paths']]:
    p=ROOT/name
    if not p.exists(): p.write_bytes(urllib.request.urlopen(base+name,timeout=40).read())
    print(name,p.stat().st_size,flush=True)
(ROOT/'provenance.json').write_text(json.dumps({'name':'Google TensorFlow.js MobileNet V1 0.50 224','license':'Apache-2.0','source':base+'model.json','inputRange':[-1,1],'files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in ROOT.iterdir() if p.name!='provenance.json'}},indent=2))
