// Holds events that kept failing, so they can be inspected instead of lost.
export function createDeadLetterStore() {
  const failed = [];
  return {
    record(event, error) {
      failed.push({ event, reason: error.message });
    },
    list() {
      return [...failed];
    },
  };
}
