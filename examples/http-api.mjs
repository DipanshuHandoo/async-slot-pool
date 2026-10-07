import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { asyncSlotPool as workerPool } from '@dipanshuhandoo/async-slot-pool';

const server = createServer(async (request, response) => {
  const match = /^\/products\/(\d+)$/.exec(request.url ?? '');
  if (!match) {
    response.writeHead(404);
    response.end();
    return;
  }
  const productId = Number(match[1]);
  await delay(productId === 1 ? 30 : 5);
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ id: productId, name: `Product ${productId}` }));
});

server.listen(0, '127.0.0.1');
await once(server, 'listening');
const baseURL = `http://127.0.0.1:${server.address().port}`;

try {
  const productIds = [1, 2, 3, 4];
  const { succeeded, failed } = await workerPool(productIds, async (productId) => {
    const response = await fetch(`${baseURL}/products/${productId}`);
    if (!response.ok) throw new Error(`HTTP ${response.status} for product ${productId}`);
    return response.json();
  }, { concurrency: 2 });

  assert.equal(failed.length, 0);
  assert.deepEqual(succeeded.map(({ result }) => result.id), productIds);
  console.table(succeeded.map(({ result }) => result));
  console.log('The local API returned ordered results despite different response times.');
} finally {
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}