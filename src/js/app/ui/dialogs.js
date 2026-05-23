/**
 * Themed modal dialogs (replaces native alert/confirm/prompt in the shell).
 */

export function createDialogsApi(deps) {
  const {
    terminalAlertOverlay,
    terminalAlertTitle,
    terminalAlertBody,
    terminalAlertOk,
    terminalAlertCancel,
  } = deps;

  function terminalDialog(message, {
    title = 'System Alert',
    confirm = false,
    okText = 'OK',
    cancelText = 'Cancel',
  } = {}) {
    if (!terminalAlertOverlay) {
      if (confirm) return Promise.resolve(window.confirm(message));
      window.alert(message);
      return Promise.resolve(true);
    }
    terminalAlertTitle.textContent = title;
    terminalAlertBody.textContent = message;
    terminalAlertOk.textContent = okText;
    terminalAlertCancel.textContent = cancelText;
    terminalAlertCancel.style.display = confirm ? '' : 'none';
    terminalAlertOverlay.classList.add('open');
    terminalAlertOverlay.setAttribute('aria-hidden', 'false');
    return new Promise((resolve) => {
      const cleanup = (value) => {
        terminalAlertOverlay.classList.remove('open');
        terminalAlertOverlay.setAttribute('aria-hidden', 'true');
        terminalAlertOk.removeEventListener('click', ok);
        terminalAlertCancel.removeEventListener('click', cancel);
        terminalAlertOverlay.removeEventListener('click', backdrop);
        window.removeEventListener('keydown', key);
        resolve(value);
      };
      const ok = () => cleanup(true);
      const cancel = () => cleanup(false);
      const backdrop = (e) => { if (e.target === terminalAlertOverlay) cleanup(false); };
      const key = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); cleanup(false); }
        if (e.key === 'Enter') { e.preventDefault(); cleanup(true); }
      };
      terminalAlertOk.addEventListener('click', ok);
      terminalAlertCancel.addEventListener('click', cancel);
      terminalAlertOverlay.addEventListener('click', backdrop);
      window.addEventListener('keydown', key);
      setTimeout(() => terminalAlertOk.focus(), 0);
    });
  }

  const themedAlert = (message, title = 'System Alert') =>
    terminalDialog(message, { title, confirm: false, okText: 'OK' });

  const themedConfirm = (message, title = 'Confirm') =>
    terminalDialog(message, { title, confirm: true, okText: 'OK', cancelText: 'Cancel' });

  function themedPrompt(message, defaultValue = '', title = 'Input') {
    if (!terminalAlertOverlay) return Promise.resolve(window.prompt(message, defaultValue));
    terminalAlertTitle.textContent = title;
    terminalAlertBody.textContent = '';
    const label = document.createElement('div');
    label.textContent = message;
    const inputEl = document.createElement('input');
    inputEl.className = 'terminal-alert-input';
    inputEl.type = 'text';
    inputEl.value = defaultValue ?? '';
    terminalAlertBody.append(label, inputEl);
    terminalAlertOk.textContent = 'OK';
    terminalAlertCancel.textContent = 'Cancel';
    terminalAlertCancel.style.display = '';
    terminalAlertOverlay.classList.add('open');
    terminalAlertOverlay.setAttribute('aria-hidden', 'false');
    return new Promise((resolve) => {
      const cleanup = (value) => {
        terminalAlertOverlay.classList.remove('open');
        terminalAlertOverlay.setAttribute('aria-hidden', 'true');
        terminalAlertOk.removeEventListener('click', ok);
        terminalAlertCancel.removeEventListener('click', cancel);
        terminalAlertOverlay.removeEventListener('click', backdrop);
        window.removeEventListener('keydown', key);
        resolve(value);
      };
      const ok = () => cleanup(inputEl.value);
      const cancel = () => cleanup(null);
      const backdrop = (e) => { if (e.target === terminalAlertOverlay) cleanup(null); };
      const key = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); cleanup(null); }
        if (e.key === 'Enter') { e.preventDefault(); cleanup(inputEl.value); }
      };
      terminalAlertOk.addEventListener('click', ok);
      terminalAlertCancel.addEventListener('click', cancel);
      terminalAlertOverlay.addEventListener('click', backdrop);
      window.addEventListener('keydown', key);
      setTimeout(() => { inputEl.focus(); inputEl.select(); }, 0);
    });
  }

  return { terminalDialog, themedAlert, themedConfirm, themedPrompt };
}
