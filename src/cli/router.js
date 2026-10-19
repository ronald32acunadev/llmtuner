import { select } from '@inquirer/prompts';
import { readSettings, writeSettings, THEMES, PROFILES, CURRENT_VERSION } from '../core/index.js';
import { t as translate, LOCALES, errorText } from '../i18n/index.js';
import { loadCommand } from './commands/load.js';
import { mcpCommand } from './commands/mcp.js';
import { presetsCommand } from './commands/presets.js';
import { settingsCommand } from './commands/settings.js';
import { helpCommand } from './commands/help.js';

export function parseCliArgs(argv) {
  const flags = new Set(['help', 'version', 'yes', 'dry-run', 'json', 'force', 'presets', 'settings']);
  const tuningKeys = new Set(['engine', 'model', 'ctx', 'profile', 'candidates', 'force', 'dry-run', 'yes', 'json']);
  const args = {};
  let command = null;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];

    // Slash commands or positional aliases
    if (a === '/load' || a === 'load') {
      command = 'load';
      continue;
    }
    if (a === '/mcp' || a === 'mcp') {
      command = 'mcp';
      continue;
    }
    if (a === '/presets' || a === 'presets') {
      command = 'presets';
      continue;
    }
    if (a === '/settings' || a === 'settings' || a === '/setting' || a === 'setting') {
      command = 'settings';
      args.settings = true;
      continue;
    }
    if (a === '/help' || a === 'help') {
      command = 'help';
      args.help = true;
      continue;
    }
    if (a === '/exit' || a === 'exit') {
      command = 'exit';
      continue;
    }

    // Short flags
    if (a === '-h') { args.help = true; command = 'help'; continue; }
    if (a === '-v') { args.version = true; command = 'version'; continue; }

    // Double-dash flags & options
    if (a.startsWith('--')) {
      const k = a.slice(2);
      if (k === 'setting' || k === 'settings') {
        args.settings = true;
        command = 'settings';
        continue;
      }
      if (k === 'presets') {
        args.presets = true;
        command = 'presets';
        continue;
      }
      if (k === 'help') {
        args.help = true;
        command = 'help';
        continue;
      }
      if (k === 'version') {
        args.version = true;
        command = 'version';
        continue;
      }

      if (flags.has(k)) {
        args[k] = true;
      } else {
        args[k] = argv[++i];
      }
      continue;
    }
  }

  // Normalize dry-run / dryRun
  if (args['dry-run']) args.dryRun = true;
  else if (args.dryRun) args['dry-run'] = true;

  // Route fallback: if command not explicitly set
  if (!command) {
    const hasTuning = Object.keys(args).some((k) => tuningKeys.has(k));
    if (hasTuning) {
      command = 'load';
    } else {
      command = 'menu';
    }
  }

  return { command, ...args };
}

export async function routeCli(argv, env = {}) {
  const parsed = parseCliArgs(argv);
  let { command, ...args } = parsed;

  let { lang, theme } = await readSettings();
  const t = (key, params) => translate(lang, key, params);

  if ('lang' in args) {
    if (!LOCALES.includes(args.lang)) {
      console.error(translate('en', 'errors.unknownLocale', { lang: args.lang ?? '', list: LOCALES.join(', ') }));
      return 1;
    }
    lang = args.lang;
    try { await writeSettings({ lang }); } catch (e) { console.error(`Warning: ${e.message}`); }
  }

  if ('theme' in args) {
    if (!THEMES.includes(args.theme)) {
      console.error(translate(lang, 'errors.unknownTheme', { theme: args.theme ?? '', list: THEMES.join(', ') }));
      return 1;
    }
    theme = args.theme;
    try { await writeSettings({ theme }); } catch (e) { console.error(`Warning: ${e.message}`); }
  }

  if ('profile' in args) {
    if (!PROFILES.includes(args.profile)) {
      console.error(translate(lang, 'errors.unknownProfile', { profile: args.profile ?? '', list: PROFILES.join(', ') }));
      return 1;
    }
  }

  if (command === 'version' || args.version) {
    console.log(CURRENT_VERSION);
    return 0;
  }

  if (command === 'help' || args.help) {
    await helpCommand(args, { lang, theme });
    return 0;
  }

  // Interactive menu mode when run bare
  if (command === 'menu') {
    const isInteractive = process.stdin.isTTY || env.forceInteractive;
    if (!isInteractive) {
      // Non-interactive without arguments falls back to load
      command = 'load';
    } else {
      try {
        command = await select({
          message: t('cli.menuTitle'),
          choices: [
            { name: `/load     ${t('cli.cmdLoadDesc')}`, value: 'load' },
            { name: `/mcp      ${t('cli.cmdMcpDesc')}`, value: 'mcp' },
            { name: `/presets  ${t('cli.cmdPresetsDesc')}`, value: 'presets' },
            { name: `/settings ${t('cli.cmdSettingsDesc')}`, value: 'settings' },
            { name: `/help     ${t('cli.cmdHelpDesc')}`, value: 'help' },
            { name: `/exit     ${t('cli.cmdExitDesc')}`, value: 'exit' },
          ],
        });
      } catch (e) {
        if (e?.name === 'ExitPromptError') return 130;
        throw e;
      }
    }
  }

  if (command === 'exit') {
    return 0;
  }

  try {
    switch (command) {
      case 'load':
        await loadCommand(args, { lang, theme });
        return 0;
      case 'mcp':
        await mcpCommand(args, { lang, theme });
        return 0;
      case 'presets':
        await presetsCommand(args, { lang, theme });
        return 0;
      case 'settings':
        await settingsCommand(args, { lang, theme });
        return 0;
      case 'help':
        await helpCommand(args, { lang, theme });
        return 0;
      default:
        console.error(`Unknown command: ${command}`);
        return 1;
    }
  } catch (e) {
    if (e?.name === 'ExitPromptError') return 130;
    console.error(`\n${t('common.error', { message: errorText(lang, e) })}`);
    return 1;
  }
}
