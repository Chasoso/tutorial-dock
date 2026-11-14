'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  SPI_SETWORKAREA, WM_SETTINGCHANGE, WM_WINDOWPOSCHANGING, WM_WINDOWPOSCHANGED,
  describePositionMessage, positionMessageName, readUnsignedMessageValue,
} = require('./position-message.cjs');

test('maps all relevant Windows message IDs without interpreting pointers', () => {
  assert.equal(positionMessageName(WM_SETTINGCHANGE), 'WM_SETTINGCHANGE');
  assert.equal(positionMessageName(WM_WINDOWPOSCHANGING), 'WM_WINDOWPOSCHANGING');
  assert.equal(positionMessageName(WM_WINDOWPOSCHANGED), 'WM_WINDOWPOSCHANGED');
});

test('recognizes SPI_SETWORKAREA from WM_SETTINGCHANGE wParam', () => {
  const action = Buffer.alloc(8);
  action.writeUInt32LE(SPI_SETWORKAREA);
  assert.equal(readUnsignedMessageValue(action), 0x002f);
  assert.deepEqual(describePositionMessage(WM_SETTINGCHANGE, 0x002f), {
    messageName: 'WM_SETTINGCHANGE',
    lParamHandling: 'raw parameter bytes only; the pointed-to string is not dereferenced',
    systemParametersInfoAction: 0x002f,
    systemParametersInfoActionName: 'SPI_SETWORKAREA',
  });
});

test('does not interpret WM_SETTINGCHANGE lParam or WINDOWPOS pointers', () => {
  assert.match(describePositionMessage(WM_SETTINGCHANGE, 0).lParamHandling, /not dereferenced/);
  assert.match(describePositionMessage(WM_WINDOWPOSCHANGING).lParamHandling, /WINDOWPOS structure is not dereferenced/);
  assert.match(describePositionMessage(WM_WINDOWPOSCHANGED).lParamHandling, /WINDOWPOS structure is not dereferenced/);
});

test('message scalar reads require a four-byte buffer and use only its low DWORD', () => {
  assert.equal(readUnsignedMessageValue(Buffer.from([0x34, 0x12, 0, 0, 0xff])), 0x1234);
  assert.equal(readUnsignedMessageValue(Buffer.from([1, 2, 3])), null);
  assert.equal(readUnsignedMessageValue(47), null);
});
