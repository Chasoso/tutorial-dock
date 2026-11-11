'use strict';

const SWP_NOZORDER = 0x0004;
const SWP_NOACTIVATE = 0x0010;
const SWP_SHOWWINDOW = 0x0040;
const SWP_NOSENDCHANGING = 0x0400;

const BASELINE_FLAGS = SWP_NOZORDER | SWP_NOACTIVATE | SWP_SHOWWINDOW;
const BASELINE_FLAG_NAMES = Object.freeze([
  'SWP_NOZORDER',
  'SWP_NOACTIVATE',
  'SWP_SHOWWINDOW',
]);

function resolvePositionVariant(value) {
  const name = value === undefined ? 'baseline' : value;
  if (name !== 'baseline' && name !== 'nosendchanging') {
    throw new RangeError(
      `Invalid TUTORIAL_DOCK_SPIKE_POSITION_VARIANT value ${JSON.stringify(name)}. ` +
      'Allowed values: baseline, nosendchanging.',
    );
  }

  const nosendchanging = name === 'nosendchanging';
  const flags = nosendchanging ? BASELINE_FLAGS | SWP_NOSENDCHANGING : BASELINE_FLAGS;
  const flagNames = nosendchanging
    ? [...BASELINE_FLAG_NAMES, 'SWP_NOSENDCHANGING']
    : [...BASELINE_FLAG_NAMES];

  return Object.freeze({
    name,
    flags,
    flagsHex: `0x${flags.toString(16).padStart(4, '0')}`,
    flagNames: Object.freeze(flagNames),
  });
}

module.exports = {
  BASELINE_FLAGS,
  SWP_NOACTIVATE,
  SWP_NOSENDCHANGING,
  SWP_NOZORDER,
  SWP_SHOWWINDOW,
  resolvePositionVariant,
};
