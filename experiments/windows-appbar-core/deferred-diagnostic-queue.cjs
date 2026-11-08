'use strict';

function createBoundedDiagnosticQueue(maxKeys = 8) {
  if (!Number.isInteger(maxKeys) || maxKeys < 1) {
    throw new RangeError('maxKeys must be a positive integer');
  }

  const pending = new Map();
  let droppedCount = 0;

  return {
    enqueue(key, event) {
      const existing = pending.get(key);
      if (existing) {
        existing.last = event;
        existing.coalescedCount += 1;
        return { queued: true, coalesced: true };
      }
      if (pending.size >= maxKeys) {
        droppedCount += 1;
        return { queued: false, coalesced: false };
      }
      pending.set(key, { key, first: event, last: event, coalescedCount: 0 });
      return { queued: true, coalesced: false };
    },

    take(maxCount = maxKeys) {
      if (!Number.isInteger(maxCount) || maxCount < 1) {
        throw new RangeError('maxCount must be a positive integer');
      }
      const entries = [];
      for (const [key, value] of pending) {
        if (entries.length >= maxCount) break;
        entries.push(value);
        pending.delete(key);
      }
      const dropped = droppedCount;
      droppedCount = 0;
      return { entries, droppedCount: dropped };
    },

    clear() {
      let queuedEventCount = 0;
      for (const value of pending.values()) queuedEventCount += value.coalescedCount + 1;
      const result = {
        queuedLabelCount: pending.size,
        queuedEventCount,
        droppedCount,
      };
      pending.clear();
      droppedCount = 0;
      return result;
    },

    get size() {
      return pending.size;
    },
  };
}

module.exports = { createBoundedDiagnosticQueue };
