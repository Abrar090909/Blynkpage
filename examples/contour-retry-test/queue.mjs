// In-memory event queue for the Contour retry example.
export function createEventQueue() {
  const pending = [];
  return {
    publish(event) {
      pending.push({ ...event, attempts: event.attempts ?? 0 });
    },
    take() {
      return pending.shift();
    },
    get size() {
      return pending.length;
    },
  };
}
