'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { resolveShowInactiveMode } = require('./show-inactive-mode.cjs');

test('unset mode preserves the existing showInactive behavior', () => {
  assert.deepEqual(resolveShowInactiveMode(undefined, 'baseline'), {
    name: 'show', invoke: true, selectionSource: 'default',
  });
});

test('explicit show mode is allowed for the fixed NoSendChanging comparison', () => {
  assert.deepEqual(resolveShowInactiveMode('show', 'nosendchanging'), {
    name: 'show', invoke: true, selectionSource: 'environment',
  });
});

test('omit mode is available only with the NoSendChanging position variant', () => {
  assert.deepEqual(resolveShowInactiveMode('omit', 'nosendchanging'), {
    name: 'omit', invoke: false, selectionSource: 'environment',
  });
  assert.throws(() => resolveShowInactiveMode('omit', 'baseline'),
    /only valid with TUTORIAL_DOCK_SPIKE_POSITION_VARIANT=nosendchanging/);
});

test('unsupported mode values fail closed', () => {
  for (const value of ['', 'SHOW', 'skip', 'true']) {
    assert.throws(() => resolveShowInactiveMode(value, 'nosendchanging'), /Allowed values: show, omit\./);
  }
});
