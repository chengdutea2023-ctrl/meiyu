import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import test from 'node:test';

import healthModule from '../platform/api/dist/modules/health/health.service.js';

const { HealthService } = healthModule;

async function startRedisStub() {
  const server = createServer((socket) => {
    socket.on('data', () => socket.end('+PONG\r\n'));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return {
    url: `redis://127.0.0.1:${address.port}/0`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test('health is ok when database and Redis respond', async () => {
  const redis = await startRedisStub();
  try {
    const service = new HealthService(
      { $queryRaw: async () => [1] },
      { get: () => redis.url },
    );
    const result = await service.check();
    assert.equal(result.status, 'ok');
    assert.equal(result.checks.database.status, 'up');
    assert.equal(result.checks.redis.status, 'up');
  } finally {
    await redis.close();
  }
});

test('health is degraded without Redis configuration', async () => {
  const service = new HealthService(
    { $queryRaw: async () => [1] },
    { get: () => undefined },
  );
  const result = await service.check();
  assert.equal(result.status, 'degraded');
  assert.equal(result.checks.database.status, 'up');
  assert.equal(result.checks.redis.status, 'down');
});
