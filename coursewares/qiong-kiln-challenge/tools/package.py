"""Build a standard plugin ZIP and a self-contained offline classroom preview."""
from pathlib import Path
import base64
import hashlib
import json
import mimetypes
import re
import sys
import subprocess
import zipfile

root = Path(__file__).resolve().parents[1]
version = '2.2.0'
source_commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=root, text=True).strip(), '正式包要求干净 Git 提交'
out = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root / 'delivery'
out.mkdir(parents=True, exist_ok=True)
static = root / 'static'
html = (static / 'index.html').read_text()
html = html.replace('<link rel="stylesheet" href="./styles.css?v=1.0.0">', '<style>\n' + (static / 'styles.css').read_text() + '\n</style>')
guided_css = (static / 'guided.css').read_text()
html = html.replace('<link rel="stylesheet" href="./guided.css?v=1.2.0">', '<style>\n' + guided_css + '\n</style>')
html = html.replace('<link rel="stylesheet" href="./workshop.css?v=2.2.0">', '<style>\n' + (static / 'workshop.css').read_text() + '\n</style>')
icon = base64.b64encode((static / 'kiln-icon.svg').read_bytes()).decode()
html = html.replace('./kiln-icon.svg', 'data:image/svg+xml;base64,' + icon)
def asset_uri(path):
    mime = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
    return 'data:' + mime + ';base64,' + base64.b64encode(path.read_bytes()).decode()
icon_map = {p.relative_to(static).as_posix(): asset_uri(p) for p in sorted((static / 'icons').glob('*.svg'))}
html = re.sub(r'url\([\"\']?\./(assets/[^)\"\']+)[\"\']?\)', lambda m: 'url("' + asset_uri(static / m[1]) + '")', html)
html = re.sub(r'src="\./([^"\s]+)"', lambda m: 'src="' + asset_uri(static / m[1].split('?')[0]) + '"' if (static / m[1].split('?')[0]).suffix in ['.png','.svg','.webp','.jpg'] else m[0], html)
for name in ['engine.js', 'demonstrations.js', 'temperature.js', 'final-learning.js', 'final-comparison.js', 'platform-client.js', 'guided.js', 'effects.js', 'sound.js', 'quiz.js', 'manual.js', 'playback.js', 'app.js']:
    source = (static / name).read_text()
    if name == 'engine.js':
        source = 'window.KILN_ASSETS=' + json.dumps(icon_map) + ';\n' + source
    if name == 'platform-client.js':
        source = source.replace('new URLSearchParams(location.search)', "new URLSearchParams('demo=1')")
    script_path = name + ('?v=2.2.0' if name in ['engine.js', 'demonstrations.js', 'final-learning.js', 'final-comparison.js', 'app.js', 'guided.js', 'effects.js', 'sound.js', 'manual.js', 'playback.js', 'quiz.js', 'platform-client.js'] else '?v=1.2.1' if name == 'temperature.js' else '')
    html = html.replace(f'<script src="./{script_path}"></script>', '<script>\n' + source.replace('</script', '<\\/script') + '\n</script>')
assert not re.search(r'(?:src|href)="\./', html), 'Offline preview still has a local asset dependency'
offline = out / '打开课件一.html'
offline.write_text(html)

files = [root / 'manifest.json', root / 'README.md', *sorted(static.rglob('*'))]
files = [p for p in files if p.is_file()]
archive = out / f'qiong-kiln-challenge-v{version}.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in files:
        info = zipfile.ZipInfo(p.relative_to(root).as_posix(), (2026, 10, 21, 0, 0, 0))
        info.external_attr = 0o100644 << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, p.read_bytes())

def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()
revision = hashlib.sha256(''.join(f'{p.relative_to(root)}:{digest(p)}\n' for p in files).encode()).hexdigest()
metadata = {'version': version, 'status': 'release-package', 'sourceCommit': source_commit, 'sourceRevisionSHA256': revision,
            'archive': archive.name, 'archiveSHA256': digest(archive), 'archiveBytes': archive.stat().st_size,
            'offline': offline.name, 'offlineSHA256': digest(offline), 'files': [p.relative_to(root).as_posix() for p in files]}
release_manifest = {'schemaVersion': 1, 'version': version, 'sourceCommit': source_commit, 'sourceDirty': False, 'sourceRevision': source_commit[:12], 'coursewares': [{'courseSlug': 'qiong-ai-inquiry', 'slug': 'qiong-kiln-challenge', 'title': '邛窑AI烧窑挑战', 'runtimeType': 'STATIC', 'fileName': archive.name, 'bytes': archive.stat().st_size, 'sha256': digest(archive)}]}
(out / 'release-manifest.json').write_text(json.dumps(release_manifest, ensure_ascii=False, indent=2) + '\n')
(out / 'release-info.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
(out / 'SHA256SUMS.txt').write_text(f'{digest(archive)}  {archive.name}\n{digest(offline)}  {offline.name}\n')
print(json.dumps(metadata, ensure_ascii=False, indent=2))
