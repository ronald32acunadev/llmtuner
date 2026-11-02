export function validateServerUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function addServer(settings, { name, url, token }, newId = () => `srv_${Date.now()}`) {
  const cleanName = String(name ?? '').trim();
  if (!cleanName) return { ok: false, errorKey: 'cli.serverNameRequired' };
  const cleanUrl = validateServerUrl(url);
  if (!cleanUrl) return { ok: false, errorKey: 'cli.serverUrlInvalid' };
  const server = { id: newId(), name: cleanName, url: cleanUrl, token: String(token ?? '').trim() || null };
  return { ok: true, patch: { servers: [...settings.servers, server] } };
}

export function removeServer(settings, id) {
  if (id === 'local') return { ok: false, errorKey: 'cli.serverLocalProtected' };
  const servers = settings.servers.filter((server) => server.id !== id);
  if (settings.activeServerId === id) {
    return { ok: true, patch: { servers, activeServerId: 'local' } };
  }
  return { ok: true, patch: { servers } };
}

export function selectServer(settings, id) {
  const exists = settings.servers.some((server) => server.id === id);
  if (!exists) return { ok: false, errorKey: 'cli.serverNotFound' };
  return { ok: true, patch: { activeServerId: id } };
}
