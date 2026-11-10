'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createBoundedDiagnosticQueue } = require('./deferred-diagnostic-queue.cjs');

test('coalesces repeated events by key and preserves first and latest samples', () => {
  const queue = createBoundedDiagnosticQueue(2);
  queue.enqueue('move', { sequence: 1 });
  const result = queue.enqueue('move', { sequence: 2 });

  assert.deepEqual(result, { queued: true, coalesced: true });
  assert.deepEqual(queue.take(), {
    entries: [{ key: 'move', first: { sequence: 1 }, last: { sequence: 2 }, coalescedCount: 1 }],
    droppedCount: 0,
  });
});

test('bounds unique queued keys and reports dropped events', () => {
  const queue = createBoundedDiagnosticQueue(1);
  queue.enqueue('move', { sequence: 1 });
  const overflow = queue.enqueue('resize', { sequence: 2 });

  assert.deepEqual(overflow, { queued: false, coalesced: false });
  assert.deepEqual(queue.take(), {
    entries: [{ key: 'move', first: { sequence: 1 }, last: { sequence: 1 }, coalescedCount: 0 }],
    droppedCount: 1,
  });
  assert.deepEqual(queue.take(), { entries: [], droppedCount: 0 });
});

test('takes a bounded batch and retains remaining keys for the next batch', () => {
  const queue = createBoundedDiagnosticQueue(3);
  queue.enqueue('show', { sequence: 1 });
  queue.enqueue('move', { sequence: 2 });
  queue.enqueue('resize', { sequence: 3 });

  assert.equal(queue.take(2).entries.length, 2);
  assert.equal(queue.size, 1);
  assert.equal(queue.take(2).entries[0].key, 'resize');
  assert.equal(queue.size, 0);
});

test('clears pending work with bounded discard counts', () => {
  const queue = createBoundedDiagnosticQueue(2);
  queue.enqueue('move', { sequence: 1 });
  queue.enqueue('move', { sequence: 2 });

  assert.deepEqual(queue.clear(), { queuedLabelCount: 1, queuedEventCount: 2, droppedCount: 0 });
  assert.equal(queue.size, 0);
  assert.deepEqual(queue.take(), { entries: [], droppedCount: 0 });
});
