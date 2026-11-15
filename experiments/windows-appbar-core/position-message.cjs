'use strict';

const WM_SETTINGCHANGE = 0x001a;
const WM_WINDOWPOSCHANGING = 0x0046;
const WM_WINDOWPOSCHANGED = 0x0047;
const SPI_SETWORKAREA = 0x002f;

function readUnsignedMessageValue(value) {
  if (!Buffer.isBuffer(value) || value.length < 4) return null;
  return value.readUInt32LE(0);
}

function positionMessageName(message) {
  return message === WM_SETTINGCHANGE
    ? 'WM_SETTINGCHANGE'
    : message === WM_WINDOWPOSCHANGING
      ? 'WM_WINDOWPOSCHANGING'
      : message === WM_WINDOWPOSCHANGED
        ? 'WM_WINDOWPOSCHANGED'
        : 'WM_UNKNOWN_0x' + Number(message).toString(16).padStart(4, '0');
}

function describePositionMessage(message, wParamValue = null) {
  const messageName = positionMessageName(message);
  const description = {
    messageName,
    lParamHandling: message === WM_SETTINGCHANGE
      ? 'raw parameter bytes only; the pointed-to string is not dereferenced'
      : 'raw parameter bytes only; any pointed-to WINDOWPOS structure is not dereferenced',
  };
  if (message === WM_SETTINGCHANGE && wParamValue !== null) {
    description.systemParametersInfoAction = wParamValue;
    description.systemParametersInfoActionName = wParamValue === SPI_SETWORKAREA
      ? 'SPI_SETWORKAREA'
      : 'other-or-unrecognized';
  }
  return description;
}

module.exports = {
  SPI_SETWORKAREA, WM_SETTINGCHANGE, WM_WINDOWPOSCHANGING, WM_WINDOWPOSCHANGED,
  describePositionMessage, positionMessageName, readUnsignedMessageValue,
};
