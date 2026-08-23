import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const forbiddenNames = new Set([
  '.env',
  '.env.production',
  'id_rsa',
  'id_ed25519',
]);
const secretPatterns = [
  /-----BEGIN (?:OPENSSH|RSA|EC|DSA) PRIVATE KEY-----/,
  /\bsk-[A-Za-z0-9_-]{24,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
];

const output = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z']);
const files = output.toString('utf8').split('\0').filter(Boolean);
const findings = [];

for (const file of files) {
  const base = path.basename(file);
  if (forbiddenNames.has(base) || base.startsWith('id_ed25519_zhike')) {
    findings.push(`${file}: 禁止纳入项目的凭据文件名`);
    continue;
  }

  const details = await stat(file).catch(() => null);
  if (!details?.isFile() || details.size > 2 * 1024 * 1024) continue;

  const content = await readFile(file, 'utf8').catch(() => null);
  if (content === null || content.includes('\u0000')) continue;
  for (const pattern of secretPatterns) {
    if (pattern.test(content)) {
      findings.push(`${file}: 匹配敏感凭据特征 ${pattern}`);
    }
  }
}

if (findings.length > 0) {
  console.error('敏感信息扫描失败：');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log(`Sensitive-data scan passed for ${files.length} project file(s).`);
}
