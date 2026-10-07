import assert from 'node:assert/strict';
import { asyncSlotPool as workerPool } from '@dipanshuhandoo/async-slot-pool';

const orders = [
  { id: 'order-1', quantity: 2, unitPrice: 15 },
  { id: 'order-2', quantity: 4, unitPrice: 10 },
  { id: 'order-3', quantity: 1, unitPrice: 25 },
];

const { succeeded, failed, stats } = await workerPool(
  orders,
  (order, index) => ({ position: index, orderId: order.id, total: order.quantity * order.unitPrice }),
  { concurrency: 2 },
);

assert.deepEqual(succeeded.map(({ result }) => result.total), [30, 40, 25]);
assert.equal(failed.length, 0);
console.table(succeeded.map(({ result }) => result));
console.log('Summary:', stats);