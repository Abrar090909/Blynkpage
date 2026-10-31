// Drains the queue. A failing event is attempted up to maxAttempts times in
// total, then moved to the dead-letter store with the attempts it used.
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
      else deadLetters.record({ ...event, attempts }, error);
    }
  }
  return delivered;
}
