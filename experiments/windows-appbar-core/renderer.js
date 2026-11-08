const appBarState = document.querySelector('#appbar-state');
const status = document.querySelector('#status');
const latest = document.querySelector('#latest');
const log = document.querySelector('#log');
const measureButton = document.querySelector('#measure');
const registerButton = document.querySelector('#register');
const sizeButtons = [document.querySelector('#small'), document.querySelector('#large')];
const removeButton = document.querySelector('#remove');
let environmentEligible = false;

const stateLabels = {
  unregistered: 'AppBar未登録',
  registering: '登録処理中',
  registered: 'AppBar登録済み',
  updating: '予約領域の更新中',
  removing: '解除処理中',
  released: '解除確認済み',
  'release-unconfirmed': '解除失敗・状態不明',
};

function show(entry) {
  latest.textContent = JSON.stringify(entry, null, 2);
}

function addLog(entry) {
  log.textContent = `${JSON.stringify(entry)}\n${log.textContent}`;
}

function updateControls(snapshot) {
  if (!snapshot) return;
  const state = snapshot.state;
  const busy = Boolean(snapshot.operation);
  appBarState.textContent = `AppBar state: ${stateLabels[state] || state}`;
  if (snapshot.operation) appBarState.textContent += ` — ${snapshot.operation}`;
  measureButton.disabled = busy;
  registerButton.disabled = busy || state !== 'unregistered' ||
    !snapshot.appBarWindowReady || !environmentEligible;
  sizeButtons.forEach((button) => {
    button.disabled = busy || state !== 'registered';
  });
  removeButton.disabled = busy || !['registered', 'release-unconfirmed'].includes(state);
  if (snapshot.logFileFailure) {
    const code = snapshot.logFileFailure.code || 'unknown';
    status.textContent = `JSONL logging failed (${code}). Current AppBar state is ${state}; logging failure does not confirm release. Use the guarded controls and verify release before closing.`;
  }
}

window.appbarSpike.onLog(addLog);
window.appbarSpike.onState(updateControls);
window.appbarSpike.state().then(updateControls).catch((error) => {
  appBarState.textContent = `State unavailable: ${error.message}`;
});

measureButton.addEventListener('click', async () => {
  status.textContent = 'Reading the current work area and both window bounds…';
  try {
    show(await window.appbarSpike.measure());
    status.textContent = 'Measurement recorded. No AppBar API call was made.';
  } catch (error) {
    status.textContent = `Measurement failed: ${error.message}`;
  }
});

registerButton.addEventListener('click', async () => {
  status.textContent = 'Registering the dedicated AppBar window; this may temporarily change the Windows work area…';
  try {
    const result = await window.appbarSpike.register();
    show(result);
    status.textContent = result.ok
      ? 'Registration and initial position calls returned. Inspect the work-area measurement separately.'
      : result.message;
  } catch (error) {
    status.textContent = `Registration failed: ${error.message}. If registration may have succeeded, use Remove and verify.`;
  }
});

async function changeHeight(height) {
  status.textContent = `Requesting ${height}px for the AppBar window only…`;
  try {
    const result = await window.appbarSpike.setHeight(height);
    show(result);
    status.textContent = `AppBar resize returned. Work-area changed=${result.workAreaChanged}; expected top=${result.matchesExpectedTop}; operator window unchanged=${result.snapshot?.operatorWindowMatchesBaseline}.`;
  } catch (error) {
    status.textContent = `Height update failed: ${error.message}. Stop other checks and use Remove and verify.`;
  }
}

document.querySelector('#small').addEventListener('click', () => changeHeight(34));
document.querySelector('#large').addEventListener('click', () => changeHeight(90));

removeButton.addEventListener('click', async () => {
  status.textContent = 'Removing the AppBar and verifying the pre-registration work area and operator-window bounds…';
  try {
    const result = await window.appbarSpike.remove();
    show(result);
    status.textContent = result.ok
      ? 'Release confirmed. The AppBar window is hidden and the work area matches its pre-registration baseline.'
      : result.message;
  } catch (error) {
    status.textContent = `Release verification failed: ${error.message}. Keep both windows open and stop testing.`;
  }
});

document.querySelector('#close').addEventListener('click', () => {
  status.textContent = 'Safe exit requested. Any active AppBar will be removed and verified first.';
  window.appbarSpike.close();
});

window.appbarSpike.measure().then((snapshot) => {
  show(snapshot);
  status.textContent = `Baseline captured. Monitors=${snapshot.monitorCount}; DPI=${snapshot.dpi}; no AppBar reservation is active.`;
  environmentEligible = snapshot.monitorCount === 1 && snapshot.dpi === 96;
  if (!environmentEligible) {
    status.textContent += ' Registration is disabled because the one-monitor/96-DPI precondition was not met.';
  }
  window.appbarSpike.state().then(updateControls);
}).catch((error) => {
  status.textContent = `Initial measurement failed: ${error.message}`;
  environmentEligible = false;
  registerButton.disabled = true;
});
