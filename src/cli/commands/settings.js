import { select } from '@inquirer/prompts';
import { writeSettings } from '../../core/index.js';
import { t as translate } from '../../i18n/index.js';
import { getColors } from '../colors.js';
import { withNav, NAV_BACK, backChoice } from '../nav.js';

export async function settingsCommand(args, { lang, theme }) {
  const c = getColors(theme);
  const t = (key, params) => translate(lang, key, params);

  while (true) {
    const action = await withNav(() => select({
      message: t('cli.settingsMenu'),
      choices: [
        { name: `${t('cli.settingsLanguage')}: ${lang === 'es' ? 'Español' : 'English'} (${lang})`, value: 'lang' },
        { name: `${t('cli.settingsTheme')}: ${theme.charAt(0).toUpperCase() + theme.slice(1)}`, value: 'theme' },
        { name: t('cli.settingsExit'), value: 'exit' },
      ],
    }));

    if (action === NAV_BACK || action === 'exit') {
      console.log(c.g(t('cli.settingsSaved')));
      break;
    }

    if (action === 'lang') {
      const res = await withNav(() => select({
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
      const res = await withNav(() => select({
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
    }
  }
}
