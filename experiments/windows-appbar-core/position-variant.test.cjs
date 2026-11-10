'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  BASELINE_FLAGS,
  SWP_NOSENDCHANGING,
  resolvePositionVariant,
} = require('./position-variant.cjs');

test('an unset variant selects the existing baseline flags', () => {
  const selected = resolvePositionVariant(undefined);

  assert.equal(BASELINE_FLAGS, 0x0054);
  assert.equal(selected.name, 'baseline');
  assert.equal(selected.flags, 84);
  assert.equal(selected.flagsHex, '0x0054');
  assert.deepEqual(selected.flagNames, [
    'SWP_NOZORDER',
    'SWP_NOACTIVATE',
    'SWP_SHOWWINDOW',
  ]);
});

test('explicit baseline is identical to the unset default', () => {
  assert.deepEqual(resolvePositionVariant('baseline'), resolvePositionVariant(undefined));
});

test('nosendchanging adds only SWP_NOSENDCHANGING to baseline', () => {
  const baseline = resolvePositionVariant('baseline');
  const selected = resolvePositionVariant('nosendchanging');

  assert.equal(SWP_NOSENDCHANGING, 0x0400);
  assert.equal(selected.name, 'nosendchanging');
  assert.equal(selected.flags, 1108);
  assert.equal(selected.flagsHex, '0x0454');
  assert.equal(selected.flags ^ baseline.flags, SWP_NOSENDCHANGING);
  assert.deepEqual(selected.flagNames, [
    'SWP_NOZORDER',
    'SWP_NOACTIVATE',
    'SWP_SHOWWINDOW',
    'SWP_NOSENDCHANGING',
  ]);
});

test('unsupported values fail closed with an actionable message', () => {
  for (const value of ['', 'Baseline', 'automatic']) {
    assert.throws(
      () => resolvePositionVariant(value),
      /Invalid TUTORIAL_DOCK_SPIKE_POSITION_VARIANT value.*Allowed values: baseline, nosendchanging\./,
    );
  }
});
