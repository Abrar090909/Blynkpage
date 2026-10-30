// Drains the queue. A failing event is re-queued up to maxAttempts times,
// then moved to the dead-letter store.
export async function drainQueue(queue, handleEvent, deadLetters, { maxAttempts = 3 } = {}) {
  let delivered = 0;
  while (queue.size > 0) {
    const event = queue.take();
    try {
      await handleEvent(event);
      delivered += 1;
    } catch (error) {
      const attempts = event.attempts + 1;
      if (attempts < maxAttempts) queue.publish({ ...event, attempts });
      else deadLetters.record(event, error);
    }
  }
  return delivered;
}
