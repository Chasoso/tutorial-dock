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

test('bounds pending entries and reports dropped events', () => {
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
  queue.enqueue('move', { sequence: 3 }, false);

  assert.deepEqual(queue.clear(), { queuedLabelCount: 1, queuedEntryCount: 2, queuedEventCount: 3, droppedCount: 0 });
  assert.equal(queue.size, 0);
  assert.deepEqual(queue.take(), { entries: [], droppedCount: 0 });
});

const {
  SPI_SETWORKAREA, WM_SETTINGCHANGE, WM_WINDOWPOSCHANGING, WM_WINDOWPOSCHANGED,
  positionMessageName,
} = require('./position-message.cjs');

test('preserves ordered Win32 message bursts and each SPI_SETWORKAREA scalar', () => {
  const queue = createBoundedDiagnosticQueue(8);
  const messages = [
    { message: WM_SETTINGCHANGE, wParamValue: SPI_SETWORKAREA, sequence: 1, observedAt: 't1' },
    { message: WM_SETTINGCHANGE, wParamValue: 0x000f, sequence: 2, observedAt: 't2' },
    { message: WM_WINDOWPOSCHANGING, wParamValue: 0, sequence: 3, observedAt: 't3' },
    { message: WM_WINDOWPOSCHANGED, wParamValue: 0, sequence: 4, observedAt: 't4' },
    { message: WM_SETTINGCHANGE, wParamValue: SPI_SETWORKAREA, sequence: 5, observedAt: 't5' },
  ];

  for (const event of messages) {
    const key = 'win32-message:' + positionMessageName(event.message);
    queue.enqueue(key, event, false);
  }

  const batch = queue.take(8);
  assert.deepEqual(batch.entries.map(({ first }) => first.sequence), [1, 2, 3, 4, 5]);
  assert.deepEqual(batch.entries.map(({ first }) => first.wParamValue), [SPI_SETWORKAREA, 0x000f, 0, 0, SPI_SETWORKAREA]);
  assert.deepEqual(batch.entries.map(({ first }) => first.observedAt), ['t1', 't2', 't3', 't4', 't5']);
  assert.ok(batch.entries.every(({ coalescedCount }) => coalescedCount === 0));
  assert.equal(batch.droppedCount, 0);
});

test('reports bounded-queue overflow for a burst of distinct Win32 observations', () => {
  const queue = createBoundedDiagnosticQueue(4);
  for (let sequence = 1; sequence <= 5; sequence += 1) {
    queue.enqueue('win32-message:WM_SETTINGCHANGE', {
      message: WM_SETTINGCHANGE,
      wParamValue: sequence === 1 ? SPI_SETWORKAREA : 0x000f,
      sequence,
    }, false);
  }

  const batch = queue.take(4);
  assert.deepEqual(batch.entries.map(({ first }) => first.sequence), [1, 2, 3, 4]);
  assert.equal(batch.entries[0].first.wParamValue, SPI_SETWORKAREA);
  assert.equal(batch.droppedCount, 1);
  assert.deepEqual(queue.take(), { entries: [], droppedCount: 0 });
});
