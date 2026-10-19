import { select } from '@inquirer/prompts';
import { writeSettings } from '../../core/index.js';
import { t as translate } from '../../i18n/index.js';
import { getColors } from '../colors.js';

export async function settingsCommand(args, { lang, theme }) {
  const c = getColors(theme);
  const t = (key, params) => translate(lang, key, params);

  while (true) {
    const action = await select({
      message: t('cli.settingsMenu'),
      choices: [
        { name: `${t('cli.settingsLanguage')}: ${lang === 'es' ? 'Español' : 'English'} (${lang})`, value: 'lang' },
        { name: `${t('cli.settingsTheme')}: ${theme.charAt(0).toUpperCase() + theme.slice(1)}`, value: 'theme' },
        { name: t('cli.settingsExit'), value: 'exit' },
      ],
    });

    if (action === 'lang') {
      lang = await select({
        message: t('cli.settingsLanguage'),
        default: lang,
        choices: [
          { name: 'English', value: 'en' },
          { name: 'Español', value: 'es' },
        ],
      });
      try {
        await writeSettings({ lang });
      } catch (e) {
        console.error(c.y(t('cli.langNotSaved', { error: e.message })));
      }
    } else if (action === 'theme') {
      theme = await select({
        message: t('cli.settingsTheme'),
        default: theme,
        choices: [
          { name: 'System', value: 'system' },
          { name: 'Light', value: 'light' },
          { name: 'Dark', value: 'dark' },
        ],
      });
      try {
        await writeSettings({ theme });
      } catch (e) {
        console.error(c.y(t('cli.themeNotSaved', { error: e.message })));
      }
    } else if (action === 'exit') {
      console.log(c.g(t('cli.settingsSaved')));
      break;
    }
  }
}
