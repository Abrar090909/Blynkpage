// Small in-memory queue used only by the Contour deployment example.
export function createEventQueue() {
  const pending = [];
  return {
    publish(event) {
      pending.push(event);
    },
    take() {
      return pending.shift();
    },
    get size() {
      return pending.length;
    },
  };
}
