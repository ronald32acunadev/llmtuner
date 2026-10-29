import { select } from '@inquirer/prompts';
import { readSettings, writeSettings, THEMES, PROFILES, CURRENT_VERSION } from '../core/index.js';
import { t as translate, LOCALES, errorText } from '../i18n/index.js';
import { loadCommand } from './commands/load.js';
import { mcpCommand } from './commands/mcp.js';
import { presetsCommand } from './commands/presets.js';
import { serveCommand } from './commands/serve.js';
import { settingsCommand } from './commands/settings.js';
import { helpCommand } from './commands/help.js';
import { withNav } from './nav.js';

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
    if (a === '/serve' || a === 'serve') {
      command = 'serve';
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
      if (k === 'serve') {
        command = 'serve';
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

  if ('server' in args) {
    const s = await readSettings();
    const target = s.servers.find((srv) => srv.id === args.server || srv.name === args.server);
    if (!target) {
      console.error(`Unknown server "${args.server}". Valid servers: ${s.servers.map((x) => x.id).join(', ')}`);
      return 1;
    }
    try {
      await writeSettings({ activeServerId: target.id });
    } catch (e) {
      console.error(`Warning: ${e.message}`);
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

  if (command === 'serve') {
    await serveCommand(args);
    return 0;
  }

  // Interactive menu mode when run bare (persistent loop until /exit)
  if (command === 'menu') {
    const isInteractive = process.stdin.isTTY || env.forceInteractive;
    if (!isInteractive) {
      await loadCommand(args, { lang, theme });
      return 0;
    }

    let currentLang = lang;
    let currentTheme = theme;

    while (true) {
      const activeT = (k, p) => translate(currentLang, k, p);
      let selectedCommand;

      try {
        selectedCommand = await withNav(() => select({
          message: activeT('cli.menuTitle'),
          choices: [
            { name: `/load     ${activeT('cli.cmdLoadDesc')}`, value: 'load' },
            { name: `/mcp      ${activeT('cli.cmdMcpDesc')}`, value: 'mcp' },
            { name: `/presets  ${activeT('cli.cmdPresetsDesc')}`, value: 'presets' },
            { name: `/serve    ${activeT('cli.cmdServeDesc')}`, value: 'serve' },
            { name: `/settings ${activeT('cli.cmdSettingsDesc')}`, value: 'settings' },
            { name: `/help     ${activeT('cli.cmdHelpDesc')}`, value: 'help' },
            { name: `/exit     ${activeT('cli.cmdExitDesc')}`, value: 'exit' },
          ],
        }), { allowBack: false });
      } catch (e) {
        if (e?.name === 'ExitPromptError') {
          return 0;
        }
        throw e;
      }

      if (selectedCommand === 'exit') {
        return 0;
      }

      try {
        switch (selectedCommand) {
          case 'load':
            await loadCommand(args, { lang: currentLang, theme: currentTheme });
            break;
          case 'mcp':
            await mcpCommand(args, { lang: currentLang, theme: currentTheme });
            break;
          case 'presets':
            await presetsCommand(args, { lang: currentLang, theme: currentTheme });
            break;
          case 'serve':
            await serveCommand(args);
            break;
          case 'settings':
            await settingsCommand(args, { lang: currentLang, theme: currentTheme });
            {
              const s = await readSettings();
              currentLang = s.lang;
              currentTheme = s.theme;
            }
            break;
          case 'help':
            await helpCommand(args, { lang: currentLang, theme: currentTheme });
            break;
        }
      } catch (e) {
        if (e?.name === 'ExitPromptError') {
          // Sub-command was cancelled, return to main menu
        } else {
          console.error(`\n${activeT('common.error', { message: errorText(currentLang, e) })}`);
        }
      }

      console.log('');
    }
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
