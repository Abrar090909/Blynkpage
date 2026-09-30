import assert from 'node:assert/strict';
import { createEventQueue } from './queue.mjs';
import { drainQueue } from './worker.mjs';

const queue = createEventQueue();
queue.publish({ type: 'order.created', orderId: 'demo-001' });
queue.publish({ type: 'order.shipped', orderId: 'demo-001' });

const delivered = [];
const count = await drainQueue(queue, async event => {
  delivered.push(event.type);
});

assert.equal(count, 2);
assert.equal(queue.size, 0);
assert.deepEqual(delivered, ['order.created', 'order.shipped']);
assert.equal(await drainQueue(queue, async () => {}), 0);
console.log('Contour example passed: producer -> queue -> worker -> handler');
