const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const repo = path.resolve(__dirname, '..');
const responseInclude = '/etc/nginx/snippets/zhike-icp-response.conf';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function rewriteConfig(original) {
  const indexes = [...original.matchAll(/^([ \t]*)index index\.html;$/gm)];
  if (indexes.length !== 2) throw new Error('Expected the two audited business servers; inspect configuration first.');
  const include = `include ${responseInclude};`;
  const includes = original.split(include).length - 1;
  if (includes !== 0 && includes !== 2) throw new Error('Partial footer configuration requires manual inspection.');
  if (/proxy_set_header\s+Accept-Encoding\s+(?!"";)/.test(original)) {
    throw new Error('Existing upstream encoding policy requires inspection.');
  }
  let result = includes ? original : original.replace(/^([ \t]*)index index\.html;$/gm, `$&\n$1${include}`);
  result = result.replace(/^([ \t]*)proxy_set_header Host ([^;\n]+);(?:\n\1proxy_set_header Accept-Encoding "";)?/gm,
    '$1proxy_set_header Host $2;\n$1proxy_set_header Accept-Encoding "";');
  return result;
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 15000 });
  if (result.status !== 0) throw new Error(`${command} failed; original configuration will be restored.`);
  return result;
}

function atomicWrite(file, content, mode) {
  const temporary = `${file}.zhike-${process.pid}.tmp`;
  fs.writeFileSync(temporary, content, { mode, flag: 'wx' });
  try { fs.renameSync(temporary, file); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const backup = args.includes('--backup') ? args[args.indexOf('--backup') + 1] : null;
  const config = '/etc/nginx/sites-enabled/meiyu.conf';
  const original = fs.readFileSync(config, 'utf8');
  const updated = rewriteConfig(original);
  const targets = [
    { file: '/etc/nginx/conf.d/zhike-icp-footer.conf', content: fs.readFileSync(path.join(repo, 'ops/nginx/zhike-icp-footer.conf')) },
    { file: responseInclude, content: fs.readFileSync(path.join(repo, 'ops/nginx/zhike-icp-response.conf')) },
    { file: config, content: Buffer.from(updated) },
  ].map(item => ({ ...item, existed: fs.existsSync(item.file), before: fs.existsSync(item.file) ? fs.readFileSync(item.file) : null,
    mode: fs.existsSync(item.file) ? fs.statSync(item.file).mode & 0o777 : 0o644 }));
  const changed = targets.filter(item => !item.before || !item.before.equals(item.content));
  console.log(JSON.stringify({ dryRun: !apply, changedFiles: changed.map(item => item.file), filingNumber: '\u8700ICP\u59072026015042\u53f7-1', domains: 'docpine.online and its subdomains' }));
  if (!apply || changed.length === 0) return;
  if (process.getuid?.() !== 0) throw new Error('Production installation requires root.');
  if (!backup || !path.isAbsolute(backup) || backup.startsWith(repo + path.sep)) throw new Error('Provide a unique private backup directory outside the repository.');
  if (fs.existsSync(backup)) throw new Error('Backup directory already exists.');
  const version = run('nginx', ['-V']);
  if (!(version.stdout + version.stderr).includes('--with-http_sub_module')) throw new Error('Nginx HTTP sub module is unavailable.');
  run('nginx', ['-t']);
  fs.mkdirSync(backup, { recursive: true, mode: 0o700 });
  const journal = changed.map((item, index) => ({ file: item.file, existed: item.existed, mode: item.mode,
    beforeHash: item.before ? hash(item.before) : null, afterHash: hash(item.content), savedFile: item.existed ? `${index}.before` : null }));
  for (let index = 0; index < changed.length; index += 1) {
    if (changed[index].before) fs.writeFileSync(path.join(backup, `${index}.before`), changed[index].before, { mode: 0o600, flag: 'wx' });
  }
  fs.writeFileSync(path.join(backup, 'journal.json'), JSON.stringify({ createdAt: new Date().toISOString(), files: journal }, null, 2), { mode: 0o600, flag: 'wx' });
  if (!fs.readFileSync(config).equals(Buffer.from(original))) throw new Error('Configuration changed concurrently.');
  const written = [];
  try {
    for (const item of changed) {
      atomicWrite(item.file, item.content, item.mode);
      written.push(item);
    }
    run('nginx', ['-t']);
    run('systemctl', ['reload', 'nginx']);
    fs.writeFileSync(path.join(backup, 'result.json'), JSON.stringify({ installedAt: new Date().toISOString(), nginxValidated: true, nginxReloaded: true, applicationRestarted: false }), { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ installed: true, backup, nginxReloaded: true, applicationRestarted: false }));
  } catch (error) {
    for (const item of written.reverse()) {
      if (item.existed) atomicWrite(item.file, item.before, item.mode);
      else if (fs.existsSync(item.file)) fs.unlinkSync(item.file);
    }
    run('nginx', ['-t']);
    run('systemctl', ['reload', 'nginx']);
    throw error;
  }
}

module.exports = { rewriteConfig };
if (require.main === module) {
  try { main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
