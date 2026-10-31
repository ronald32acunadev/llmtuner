export async function setupSharedHosting({ document, bridge, t }) {
  if (!bridge) return;

  const section = document.getElementById('shared-server-section');
  const host = document.getElementById('shared-server-host');
  const port = document.getElementById('shared-server-port');
  const token = document.getElementById('shared-server-token');
  const start = document.getElementById('shared-server-start');
  const status = document.getElementById('shared-server-status');

  section.hidden = false;

  const showRunning = (url) => {
    status.textContent = t('web.sharedServerRunning', { url });
    start.disabled = true;
  };

  start.onclick = async () => {
    start.disabled = true;
    try {
      const result = await bridge.startSharedServer({
        host: host.value.trim(),
        port: Number(port.value.trim()),
        token: token.value.trim() || undefined,
      });
      if (result.running) {
        token.value = '';
        showRunning(result.url);
      } else {
        status.textContent = t(result.code, result.params);
        start.disabled = false;
      }
    } catch (error) {
      status.textContent = error.message;
      start.disabled = false;
    }
  };

  try {
    const current = await bridge.getSharedServerStatus();
    host.value = current.host ?? '0.0.0.0';
    port.value = String(current.port ?? 7860);
    if (current.running) showRunning(current.url);
    else status.textContent = t('web.sharedServerStopped');
  } catch (error) {
    status.textContent = error.message;
  }
}
