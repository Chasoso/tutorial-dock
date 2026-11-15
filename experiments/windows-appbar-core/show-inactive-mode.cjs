'use strict';

const ENVIRONMENT_VARIABLE = 'TUTORIAL_DOCK_SPIKE_SHOW_INACTIVE';

function resolveShowInactiveMode(value, positionVariantName) {
  const name = value === undefined ? 'show' : value;
  if (name !== 'show' && name !== 'omit') {
    throw new RangeError(
      'Invalid ' + ENVIRONMENT_VARIABLE + ' value ' + JSON.stringify(name) + '. Allowed values: show, omit.',
    );
  }
  if (name === 'omit' && positionVariantName !== 'nosendchanging') {
    throw new RangeError(
      ENVIRONMENT_VARIABLE + '=omit is only valid with TUTORIAL_DOCK_SPIKE_POSITION_VARIANT=nosendchanging.',
    );
  }
  return Object.freeze({
    name,
    invoke: name === 'show',
    selectionSource: value === undefined ? 'default' : 'environment',
  });
}

module.exports = { ENVIRONMENT_VARIABLE, resolveShowInactiveMode };
