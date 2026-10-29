export async function setupServerSettings({ document, bridge, t }) {
  if (!bridge) return;

  const root = document.getElementById('local-server-settings');
  const autostart = document.getElementById('local-server-autostart');
  const status = document.getElementById('local-server-status');
  const feedback = document.getElementById('local-server-feedback');
  const token = document.getElementById('server-token');
  const revealBtn = document.getElementById('server-token-reveal');
  const copyBtn = document.getElementById('server-token-copy');
  const info = document.getElementById('server-connection-info');
  const closeBtn = document.getElementById('settings-close');
  const backdrop = document.getElementById('settings-backdrop');
  const openBtn = document.getElementById('settings-open');

  root.hidden = false;
  token.value = '';
  token.type = 'password';

  let confirmedState = null;
  let isBusy = false;
  let generation = 0;

  const updateStatusUI = (enabled, unknown = false) => {
    if (unknown) {
      status.textContent = t('web.serverStartupUnknown');
    } else {
      status.textContent = enabled ? t('web.serverStartupEnabled') : t('web.serverStartupDisabled');
      autostart.value = enabled ? 'enabled' : 'disabled';
    }
  };

  const refreshStatus = async () => {
    if (isBusy) return;
    isBusy = true;
    try {
      const enabled = await bridge.getAutostartStatus();
      confirmedState = enabled;
      updateStatusUI(enabled);
      autostart.disabled = false;
    } catch (e) {
      updateStatusUI(null, true);
      autostart.disabled = true;
      feedback.textContent = e.message;
    } finally {
      isBusy = false;
    }
  };

  autostart.addEventListener('change', async () => {
    if (isBusy) return;
    const wanted = autostart.value === 'enabled';
    isBusy = true;
    autostart.disabled = true;
    try {
      const result = await bridge.setAutostartEnabled(wanted);
      if (result !== wanted) throw new Error(t('web.serverStartupUnconfirmed'));
      confirmedState = wanted;
      updateStatusUI(wanted);
      feedback.textContent = t('web.serverStartupSaved');
    } catch (e) {
      if (confirmedState !== null) {
        updateStatusUI(confirmedState);
        autostart.value = confirmedState ? 'enabled' : 'disabled';
      }
      feedback.textContent = e.message;
    } finally {
      isBusy = false;
      if (confirmedState !== null) autostart.disabled = false;
    }
  });

  revealBtn.addEventListener('click', async () => {
    feedback.textContent = '';
    if (token.value !== '') {
      token.value = '';
      token.type = 'password';
      info.textContent = '';
      revealBtn.textContent = t('web.serverTokenReveal');
      return;
    }

    const currentGen = generation;
    try {
      const res = await bridge.revealConnection();
      if (currentGen !== generation) return;

      if (!res.configured) {
        token.value = '';
        feedback.textContent = t('web.serverNoConfig');
      } else {
        token.value = res.token;
        token.type = 'text';
        revealBtn.textContent = t('web.serverTokenHide');
        info.textContent = t('web.serverConnectionInfo', { host: res.host, port: res.port });
      }
    } catch (e) {
      if (currentGen === generation) feedback.textContent = e.message;
    }
  });

  copyBtn.addEventListener('click', async () => {
    feedback.textContent = '';
    try {
      const res = await bridge.copyToken();
      if (res?.copied !== true) throw new Error(t('web.serverTokenCopyFailed'));
      feedback.textContent = t('web.serverTokenCopied');
    } catch (e) {
      feedback.textContent = e.message;
    }
  });

  const close = () => {
    generation++;
    token.value = '';
    token.type = 'password';
    info.textContent = '';
    revealBtn.textContent = t('web.serverTokenReveal');
  };

  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  openBtn.addEventListener('click', refreshStatus);

  await refreshStatus().catch(() => {});
}
