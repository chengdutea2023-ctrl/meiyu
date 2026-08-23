import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import process from 'node:process';

import { validateCatalog } from './courseware-release.mjs';

const checks = [];

function add(name, ok, details) {
  checks.push({ name, ok, details });
  console.log(`${ok ? 'OK' : 'FAIL'}  ${name}: ${details}`);
}

const nodeMajor = Number(process.versions.node.split('.')[0]);
add('Node.js', nodeMajor >= 20, process.versions.node);
add('依赖', existsSync('node_modules'), existsSync('node_modules') ? 'node_modules 已安装' : '请运行 npm install');
add(
  'Prisma Client',
  existsSync('node_modules/.prisma/client/index.d.ts'),
  existsSync('node_modules/.prisma/client/index.d.ts') ? '已生成' : '请运行 npm run prisma:generate',
);
add(
  '本地 API 环境',
  existsSync('platform/api/.env'),
  existsSync('platform/api/.env') ? 'platform/api/.env 已存在' : '请从 platform/api/.env.example 创建',
);

try {
  const result = await validateCatalog();
  add('课件清单', result.coursewares.length === 7, `${result.coursewares.length} 个课件通过结构校验`);
} catch (error) {
  add('课件清单', false, error.message);
}

try {
  const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim() || '(detached)';
  const status = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
  add('Git', true, `${branch}，${status ? '存在未提交内容' : '工作区干净'}`);
} catch (error) {
  add('Git', false, error.message);
}

if (checks.some((check) => !check.ok)) {
  process.exitCode = 1;
}
