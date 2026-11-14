'use strict';

function createBoundedDiagnosticQueue(maxEntries = 8) {
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new RangeError('maxEntries must be a positive integer');
  }

  const pending = [];
  let droppedCount = 0;

  return {
    enqueue(key, event, coalesce = true) {
      if (coalesce) {
        for (let index = pending.length - 1; index >= 0; index -= 1) {
          const existing = pending[index];
          if (existing.key === key && existing.coalesce) {
            existing.last = event;
            existing.coalescedCount += 1;
            return { queued: true, coalesced: true };
          }
        }
      }

      if (pending.length >= maxEntries) {
        droppedCount += 1;
        return { queued: false, coalesced: false };
      }

      pending.push({ key, first: event, last: event, coalescedCount: 0, coalesce });
      return { queued: true, coalesced: false };
    },

    take(maxCount = maxEntries) {
      if (!Number.isInteger(maxCount) || maxCount < 1) {
        throw new RangeError('maxCount must be a positive integer');
      }
      const entries = pending.splice(0, maxCount).map(({ key, first, last, coalescedCount }) => ({
        key, first, last, coalescedCount,
      }));
      const dropped = droppedCount;
      droppedCount = 0;
      return { entries, droppedCount: dropped };
    },

    clear() {
      let queuedEventCount = 0;
      const labels = new Set();
      for (const value of pending) {
        queuedEventCount += value.coalescedCount + 1;
        labels.add(value.key);
      }
      const result = {
        queuedLabelCount: labels.size,
        queuedEntryCount: pending.length,
        queuedEventCount,
        droppedCount,
      };
      pending.length = 0;
      droppedCount = 0;
      return result;
    },

    get size() {
      return pending.length;
    },
  };
}

module.exports = { createBoundedDiagnosticQueue };
