from pathlib import Path
import sys, json, hashlib, subprocess, zipfile
root=Path(__file__).resolve().parents[1];repo=root.parents[1]
out=repo/(sys.argv[1] if len(sys.argv)>1 else 'output/qiong-vision-release');out.mkdir(parents=True,exist_ok=True)
commit=subprocess.check_output(['git','rev-parse','--short=12','HEAD'],cwd=repo,text=True).strip()
dirty=bool(subprocess.check_output(['git','status','--porcelain','--','coursewares/qiong-ai-vision-challenge'],cwd=repo,text=True).strip())
version=commit+('-dirty' if dirty else '')
archive=out/('qiong-ai-vision-challenge-'+version+'.zip')
files=[root/'manifest.json',root/'README.md']+sorted((root/'static').rglob('*'))+sorted((root/'server').glob('*.mjs'))+sorted((root/'server').glob('*.js'))+sorted((root/'server').glob('*.json'))
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for p in files:
  if p.is_file():z.write(p,str(p.relative_to(root)))
if archive.stat().st_size>80*1024*1024:raise RuntimeError('ZIP exceeds 80 MB')
info={'title':'邛窑 -AI看见了什么','version':'2.0.0','sourceCommit':commit,'sourceDirty':dirty,'file':archive.name,'bytes':archive.stat().st_size,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest()}
(out/'release-manifest.json').write_text(json.dumps(info,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(info,ensure_ascii=False))
