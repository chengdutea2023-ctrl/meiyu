const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { rewriteConfig } = require('./install-icp-footer.cjs');
const root = path.resolve(__dirname, '..');
const config = fs.readFileSync(path.join(root, 'ops/nginx/meiyu.conf'), 'utf8');

test('filing gateway patch is idempotent and preserves existing routes and certificates', () => {
  const result = rewriteConfig(config);
  assert.equal(rewriteConfig(result), result);
  assert.equal(result.split('include /etc/nginx/snippets/zhike-icp-response.conf;').length - 1, 2);
  const hosts = [...result.matchAll(/proxy_set_header Host /g)].length;
  assert.equal([...result.matchAll(/proxy_set_header Accept-Encoding "";/g)].length, hosts);
  for (const line of config.split('\n').filter(line => /proxy_pass |ssl_certificate|server_name |try_files |proxy_ssl_verify/.test(line))) assert.ok(result.includes(line));
});

test('unexpected or partially configured gateways are rejected', () => {
  assert.throws(() => rewriteConfig('server { index index.html; }'), /audited/);
  const patched = rewriteConfig(config);
  assert.throws(() => rewriteConfig(patched.replace('include /etc/nginx/snippets/zhike-icp-response.conf;', '')), /Partial/);
  assert.throws(() => rewriteConfig(patched.replace('Accept-Encoding "";', 'Accept-Encoding "gzip";')), /encoding/);
});

test('the exact filing number links to MIIT and is restricted to the filed domain', () => {
  const map = fs.readFileSync(path.join(root, 'ops/nginx/zhike-icp-footer.conf'), 'utf8');
  assert.ok(map.includes('default "";'));
  assert.ok(map.includes('~(^|\\.)docpine\\.online$'));
  const footer = map.split('\n').find(line => line.trim().startsWith('~')).match(/'([^']+)';\s*$/)[1];
  assert.equal((footer.match(/蜀ICP备2026015042号-1/g) || []).length, 1);
  assert.ok(footer.includes('href="https://beian.miit.gov.cn/"'));
  assert.ok(footer.includes('target="_blank" rel="noopener noreferrer"'));
  assert.ok(footer.includes('position:relative!important'));
  assert.ok(footer.includes('max-width:100vw;min-width:0;'));
  assert.equal(/position:\s*fixed/.test(footer), false);
  for (const host of ['docpine.online', 'www.docpine.online', 'teacher.docpine.online', 'agent.docpine.online']) assert.ok(/(^|\.)docpine\.online$/i.test(host));
  for (const host of ['meiyu.cdbbox.com', '47.109.198.96', 'docpine.online.example.com']) assert.equal(/(^|\.)docpine\.online$/i.test(host), false);
});

test('response filtering is HTML-only, single-pass and does not change proxy destinations', () => {
  const response = fs.readFileSync(path.join(root, 'ops/nginx/zhike-icp-response.conf'), 'utf8');
  assert.ok(response.includes('sub_filter_once on;'));
  assert.ok(response.includes("sub_filter '</body>' '$zhike_icp_footer</body>';"));
  assert.equal(response.includes('sub_filter_types'), false);
  assert.equal(response.includes('proxy_pass'), false);
});
