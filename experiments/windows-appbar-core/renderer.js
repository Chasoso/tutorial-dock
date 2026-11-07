const status = document.querySelector('#status');
const latest = document.querySelector('#latest');
const log = document.querySelector('#log');
const registerButton = document.querySelector('#register');
const sizeButtons = [document.querySelector('#small'), document.querySelector('#large')];
const removeButton = document.querySelector('#remove');

function show(entry) {
  latest.textContent = JSON.stringify(entry, null, 2);
}

function addLog(entry) {
  log.textContent = `${JSON.stringify(entry)}\n${log.textContent}`;
}

window.appbarSpike.onLog(addLog);

document.querySelector('#measure').addEventListener('click', async () => {
  try {
    show(await window.appbarSpike.measure());
    status.textContent = 'Measurement recorded. No AppBar call was made.';
  } catch (error) {
    status.textContent = `Measurement failed: ${error.message}`;
  }
});

registerButton.addEventListener('click', async () => {
  registerButton.disabled = true;
  status.textContent = 'Registering the AppBar and temporarily requesting a top-edge work area…';
  try {
    const result = await window.appbarSpike.register();
    show(result);
    status.textContent = result.ok
      ? 'AppBar API registration returned success. Check the measured work area separately.'
      : result.message;
    if (!result.ok && !String(result.message).includes('no reservation test was started')) {
      removeButton.disabled = false;
    }
    if (result.ok) {
      sizeButtons.forEach((button) => { button.disabled = false; });
      removeButton.disabled = false;
    }
  } catch (error) {
    status.textContent = `Registration failed: ${error.message}. If ABM_NEW succeeded, use Remove and verify.`;
    removeButton.disabled = false;
  } finally {
    registerButton.disabled = true;
  }
});

async function changeHeight(height) {
  status.textContent = `Requesting ${height}px reservation…`;
  try {
    const result = await window.appbarSpike.setHeight(height);
    show(result);
    status.textContent = `Set-position call completed. Work-area change: ${result.workAreaChanged}; expected top: ${result.matchesExpectedTop}.`;
  } catch (error) {
    status.textContent = `Height update failed: ${error.message}. Stop other checks and release the AppBar.`;
  }
}

document.querySelector('#small').addEventListener('click', () => changeHeight(34));
document.querySelector('#large').addEventListener('click', () => changeHeight(90));

removeButton.addEventListener('click', async () => {
  removeButton.disabled = true;
  status.textContent = 'Unregistering and verifying that the work area returns exactly to baseline…';
  try {
    const result = await window.appbarSpike.remove();
    show(result);
    status.textContent = result.ok
      ? 'Release confirmed: the measured work area matches baseline. The window may now close normally.'
      : result.message;
    if (!result.ok) removeButton.disabled = false;
    if (result.ok) {
      registerButton.disabled = true;
      sizeButtons.forEach((button) => { button.disabled = true; });
    }
  } catch (error) {
    status.textContent = `Release verification failed: ${error.message}. Keep the window open and stop testing.`;
    removeButton.disabled = false;
  }
});

document.querySelector('#close').addEventListener('click', () => window.appbarSpike.close());

window.appbarSpike.measure().then((snapshot) => {
  show(snapshot);
  status.textContent = `Baseline captured. Monitors=${snapshot.monitorCount}; DPI=${snapshot.dpi}; no reservation is active.`;
  registerButton.disabled = snapshot.monitorCount !== 1 || snapshot.dpi !== 96;
  if (registerButton.disabled) {
    status.textContent += ' Registration is disabled because the one-monitor/96-DPI precondition was not met.';
  }
}).catch((error) => {
  status.textContent = `Initial measurement failed: ${error.message}`;
  registerButton.disabled = true;
});
