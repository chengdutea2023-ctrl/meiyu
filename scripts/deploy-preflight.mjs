import { execFileSync } from 'node:child_process';
import process from 'node:process';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

const branch = git(['branch', '--show-current']);
const status = git(['status', '--porcelain']);

if (branch !== 'main') {
  throw new Error(`生产发布只能从 main 执行，当前分支为 ${branch || '(detached)'}`);
}
if (status) {
  throw new Error('工作区存在未提交内容，停止发布。请先提交并完成验证。');
}

const upstream = git(['rev-parse', '--abbrev-ref', '@{upstream}']);
if (upstream !== 'origin/main') {
  throw new Error(`main 的上游必须是 origin/main，当前为 ${upstream}`);
}

const aheadBehind = git(['rev-list', '--left-right', '--count', 'HEAD...origin/main'])
  .split(/\s+/)
  .map(Number);
if (aheadBehind[0] !== 0 || aheadBehind[1] !== 0) {
  throw new Error(`本地与 origin/main 未对齐：本地领先 ${aheadBehind[0]}，落后 ${aheadBehind[1]}`);
}

console.log(`Preflight passed: ${git(['rev-parse', '--short=12', 'HEAD'])} (${branch})`);
console.log('继续发布前仍需确认：数据库备份/ECS 快照已完成，服务器工作区干净且可快进。');

process.exitCode = 0;
