import assert from 'node:assert/strict';
import { createEventQueue } from './queue.mjs';
import { createDeadLetterStore } from './dead-letter.mjs';
import { drainQueue } from './worker.mjs';

const queue = createEventQueue();
const deadLetters = createDeadLetterStore();
queue.publish({ type: 'payment.captured', id: 'pay-001' });
queue.publish({ type: 'payment.refunded', id: 'pay-002' });

let flaky = 0;
const delivered = await drainQueue(queue, async (event) => {
  if (event.type === 'payment.refunded') throw new Error('ledger unavailable');
  if (event.type === 'payment.captured' && flaky++ === 0) throw new Error('timeout');
}, deadLetters);

// The capture fails once, is retried and lands; the refund fails every time
// and ends up in the dead-letter store instead of being dropped.
assert.equal(delivered, 1);
assert.deepEqual(deadLetters.list(), [
  { event: { type: 'payment.refunded', id: 'pay-002', attempts: 3 }, reason: 'ledger unavailable' },
]);
console.log('Contour retry example passed: producer -> queue -> worker -> handler, failures -> dead letters');
