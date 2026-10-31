import { randomUUID } from 'node:crypto';
import { confirm, input, password, select } from '@inquirer/prompts';
import { getActiveServer, readSettings, writeSettings } from '../../core/index.js';
import { TunerApiClient } from '../../core/client.js';
import { t as translate } from '../../i18n/index.js';
import { getColors } from '../colors.js';
import { NAV_BACK, backChoice, withNav } from '../nav.js';
import { validateServerUrl } from '../../web/public/saved-servers.js';

export async function serversCommand(args, { lang, theme }, dependencies = {}) {
  const {
    selectPrompt = select,
    inputPrompt = input,
    passwordPrompt = password,
    confirmPrompt = confirm,
    readSettings: loadSettings = readSettings,
    writeSettings: saveSettings = writeSettings,
    createClient = (server) => new TunerApiClient({ baseUrl: server.url, token: server.token }),
    log = console.log,
    error = console.error,
  } = dependencies;
  const c = getColors(theme);
  const t = (key, params) => translate(lang, key, params);
  let settings = await loadSettings();

  while (true) {
    const active = getActiveServer(settings);
    const choices = [
      { name: t('cli.serverAdd'), value: 'add' },
      ...settings.servers.flatMap((server) => [
        { name: `${server.name} — ${server.url}${server.id === active.id ? ` (${t('web.serverActive')})` : ''}`, value: `details:${server.id}` },
        { name: t('cli.serverTest', { name: server.name }), value: `test:${server.id}` },
        { name: t('cli.serverSelect', { name: server.name }), value: `select:${server.id}` },
        { name: t('cli.serverRemove', { name: server.name }), value: `remove:${server.id}` },
      ]),
      backChoice(t, c),
    ];
    log(t('cli.serverRoleInfo'));
    const action = await withNav(() => selectPrompt({ message: t('cli.serversMenu', { name: active.name, url: active.url }), choices }));
    if (action === NAV_BACK) return;

    if (action === 'add') {
      let nameBuffer = '';
      const name = await withNav(() => inputPrompt({
        message: t('cli.serverNamePrompt'),
        transformer: (value) => {
          nameBuffer = value;
          return value;
        },
        validate: (value) => value.trim().length > 0 || t('cli.serverNameRequired'),
      }), { isTextInput: true, getInputValue: () => nameBuffer });
      if (name === NAV_BACK) continue;
      if (!String(name || '').trim()) {
        error(c.y(t('cli.serverNameRequired')));
        continue;
      }
      const normalizedName = String(name).trim();
      let urlBuffer = '';
      const rawUrl = await withNav(() => inputPrompt({
        message: t('cli.serverUrlPrompt'),
        transformer: (value) => {
          urlBuffer = value;
          return value;
        },
        validate: (value) => validateServerUrl(value) ? true : t('cli.serverUrlInvalid'),
      }), { isTextInput: true, getInputValue: () => urlBuffer });
      if (rawUrl === NAV_BACK) continue;
      const url = validateServerUrl(rawUrl);
      if (!url) {
        error(c.y(t('cli.serverUrlInvalid')));
        continue;
      }
      const token = await withNav(() => passwordPrompt({
        message: t('cli.serverTokenPrompt'),
        mask: '*',
      }), { isTextInput: true, getInputValue: () => '\u0000' });
      if (token === NAV_BACK) continue;
      const server = { id: randomUUID(), name: normalizedName, url, token: String(token || '').trim() || null };
      try {
        settings = await saveSettings({ servers: [...settings.servers, server] });
        log(c.g(t(server.url.startsWith('http:') ? 'cli.serverAddedHttp' : 'cli.serverAdded', { name: server.name })));
      } catch (e) {
        error(c.y(t('cli.serverSaveFailed', { error: safeError(e, server.token) })));
      }
      continue;
    }

    const [operation, serverId] = String(action).split(':');
    const server = settings.servers.find((item) => item.id === serverId);
    if (!server) continue;
    if (operation === 'details') {
      log(t('cli.serverDetails', { name: server.name, url: server.url, active: server.id === active.id ? t('web.serverActive') : t('cli.serverInactive'), transport: server.url.startsWith('https:') ? t('cli.serverHttps') : t('cli.serverHttpWarning') }));
    } else if (operation === 'test') {
      try {
        await createClient(server).getState();
        log(c.g(t('cli.serverTestSuccess', { name: server.name })));
      } catch (e) {
        error(c.y(t('cli.serverTestFailed', { name: server.name, error: safeError(e, server.token) })));
      }
    } else if (operation === 'select') {
      try {
        settings = await saveSettings({ activeServerId: server.id });
        log(c.g(t('cli.serverSelected', { name: server.name })));
      } catch (e) {
        error(c.y(t('cli.serverSaveFailed', { error: safeError(e, server.token) })));
      }
    } else if (operation === 'remove') {
      if (server.id === 'local') {
        error(c.y(t('cli.serverLocalProtected')));
        continue;
      }
      const accepted = await withNav(() => confirmPrompt({ message: t('cli.serverRemoveConfirm', { name: server.name }), default: false }));
      if (accepted === NAV_BACK || !accepted) continue;
      try {
        settings = await saveSettings({
          servers: settings.servers.filter((item) => item.id !== server.id),
          ...(settings.activeServerId === server.id ? { activeServerId: 'local' } : {}),
        });
        log(c.g(t('cli.serverRemoved', { name: server.name })));
      } catch (e) {
        error(c.y(t('cli.serverSaveFailed', { error: safeError(e, server.token) })));
      }
    }
  }
}

function safeError(error, token) {
  const message = String(error?.message || error || 'Unknown error');
  return token ? message.split(token).join('[redacted]') : message;
}
