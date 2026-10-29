import { select } from '@inquirer/prompts';
import { writeSettings, resolveConnectableHost } from '../../core/index.js';
import { t as translate } from '../../i18n/index.js';
import { createServerAutostart } from '../../platform/server-autostart.js';
import { serverConfigPath, readServerConfig } from './serve.js';
import { getColors } from '../colors.js';
import { withNav, NAV_BACK, backChoice } from '../nav.js';

export async function settingsCommand(args, { lang, theme }, dependencies = {}) {
  const {
    selectPrompt = select,
    autostart = createServerAutostart({ configPath: serverConfigPath() }),
    readConfig = readServerConfig
  } = dependencies;
  const c = getColors(theme);
  const t = (key, params) => translate(lang, key, params);
  let startupEnabled;
  try {
    startupEnabled = await autostart.status();
  } catch (e) {
    startupEnabled = null;
    console.error(c.y(t('cli.autostartFailed', { error: e.message })));
  }

  while (true) {
    const action = await withNav(() => selectPrompt({
      message: t('cli.settingsMenu'),
      choices: [
        { name: `${t('cli.settingsLanguage')}: ${lang === 'es' ? 'Español' : 'English'} (${lang})`, value: 'lang' },
        { name: `${t('cli.settingsTheme')}: ${theme.charAt(0).toUpperCase() + theme.slice(1)}`, value: 'theme' },
        { name: `${t('cli.settingsAutostart')}: ${t(startupEnabled === null ? 'cli.unknown' : startupEnabled ? 'cli.enabled' : 'cli.disabled')}`, value: 'serverAutostart' },
        { name: t('cli.serverConnection'), value: 'serverConnection' },
        { name: t('cli.settingsExit'), value: 'exit' },
      ],
    }));

    if (action === NAV_BACK || action === 'exit') {
      console.log(c.g(t('cli.settingsSaved')));
      break;
    }

    if (action === 'lang') {
      const res = await withNav(() => selectPrompt({
        message: t('cli.settingsLanguage'),
        default: lang,
        choices: [
          { name: 'English', value: 'en' },
          { name: 'Español', value: 'es' },
          backChoice(t, c),
        ],
      }));
      if (res !== NAV_BACK) {
        lang = res;
        try {
          await writeSettings({ lang });
        } catch (e) {
          console.error(c.y(t('cli.langNotSaved', { error: e.message })));
        }
      }
    } else if (action === 'theme') {
      const res = await withNav(() => selectPrompt({
        message: t('cli.settingsTheme'),
        default: theme,
        choices: [
          { name: 'System', value: 'system' },
          { name: 'Light', value: 'light' },
          { name: 'Dark', value: 'dark' },
          backChoice(t, c),
        ],
      }));
      if (res !== NAV_BACK) {
        theme = res;
        try {
          await writeSettings({ theme });
        } catch (e) {
          console.error(c.y(t('cli.themeNotSaved', { error: e.message })));
        }
      }
    } else if (action === 'serverAutostart') {
      const enabled = startupEnabled === true;
      const res = await withNav(() => selectPrompt({
        message: t('cli.settingsAutostart'),
        default: enabled,
        choices: [
          { name: t('cli.settingsAutostartEnable'), value: true },
          { name: t('cli.settingsAutostartDisable'), value: false },
          backChoice(t, c),
        ],
      }));
      if (res !== NAV_BACK) {
        try {
          const updated = await autostart.setEnabled(res);
          if (updated !== res) throw new Error('The operating system did not confirm the requested startup state.');
          startupEnabled = res;
          console.log(c.g(t(res ? 'cli.autostartEnabled' : 'cli.autostartDisabled')));
        } catch (e) {
          console.error(c.y(t('cli.autostartFailed', { error: e.message })));
        }
      }
    } else if (action === 'serverConnection') {
      try {
        const cfg = await readConfig();
        if (!cfg) {
          console.log(c.y(t('cli.serverNoConfig')));
        } else {
          const isValid = typeof cfg.host === 'string' && cfg.host.length > 0 &&
                          Number.isInteger(cfg.port) && cfg.port >= 1 && cfg.port <= 65535 &&
                          typeof cfg.token === 'string' && cfg.token.length > 0;
          if (!isValid) {
            throw new Error(t('cli.serverConnectionInvalid'));
          }
          const displayHost = resolveConnectableHost(cfg.host);
          console.log(t('cli.serverConnectionDetails', { host: displayHost, port: cfg.port, token: cfg.token }));
        }
      } catch (e) {
        console.error(c.y(t('common.error', { message: e.message })));
      }
    }
  }
}
