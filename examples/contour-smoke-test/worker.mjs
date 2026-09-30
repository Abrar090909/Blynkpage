// Drain the example queue in order and await each event handler.
export async function drainQueue(queue, handleEvent) {
  let processed = 0;
  while (queue.size > 0) {
    const event = queue.take();
    await handleEvent(event);
    processed += 1;
  }
  return processed;
}
