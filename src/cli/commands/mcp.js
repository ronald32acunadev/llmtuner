import { select, checkbox, input, Separator } from '@inquirer/prompts';
import { detectHardware, detectEngines, detectAgents, installMcpServer, readSettings } from '../../core/index.js';
import { t as translate } from '../../i18n/index.js';
import { getColors } from '../colors.js';
import { withNav, NAV_BACK, backChoice } from '../nav.js';

export async function mcpCommand(args, { lang, theme }) {
  const c = getColors(theme);
  const t = (key, params) => translate(lang, key, params);

  let step = 1;
  let engineId = args.engine;
  let selectedAgents = [];
  let customName = args.name;
  let agents = null;

  while (step >= 1 && step <= 3) {
    if (step === 1) {
      if (args.engine) {
        step = 2;
        continue;
      }
      const hw = await detectHardware();
      const det = await detectEngines(hw);
      const res = await withNav(() => select({
        message: t('cli.mcpSelectEngine'),
        default: det.recommended || 'lmstudio',
        choices: [
          { name: 'LM Studio', value: 'lmstudio' },
          { name: 'Ollama', value: 'ollama' },
          new Separator(),
          backChoice(t, c),
        ],
      }));
      if (res === NAV_BACK) return;
      engineId = res;
      step = 2;
    }
    else if (step === 2) {
      if (!agents) {
        agents = await detectAgents();
      }
      const res = await withNav(() => checkbox({
        message: `${t('cli.mcpSelectAgents')} ${c.dim(`(Backspace: ${t('common.back')})`)}`,
        choices: agents.map((agent) => {
          const isConfigured = agent.configuredServers?.includes(engineId);
          let statusStr = agent.detected ? c.g(`[${t('cli.mcpStatusDetected')}]`) : c.dim(`[${t('cli.mcpStatusAvailable')}]`);
          if (isConfigured) {
            statusStr += ` ${c.cyan(`(${t('web.mcpAlreadyConfigured')})`)}`;
          }
          return {
            name: `${agent.name.padEnd(18)} ${statusStr}`,
            value: agent.id,
            checked: agent.detected,
          };
        }),
      }));
      if (res === NAV_BACK) {
        if (args.engine) return;
        step = 1;
        continue;
      }
      if (!res.length) {
        console.log(c.y(t('cli.mcpNoAgentsSelected')));
        return;
      }
      selectedAgents = res;
      step = 3;
    }
    else if (step === 3) {
      if (args.name) {
        customName = args.name;
        break;
      }
      let buffer = '';
      const res = await withNav(() => input({
        message: `${t('cli.mcpServerNamePrompt')} ${c.dim(`(Backspace: ${t('common.back')})`)}`,
        default: engineId,
        validate: (val) => {
          buffer = val;
          if (val.toLowerCase() === 'b' || val.toLowerCase() === 'back') return true;
          return Boolean(val.trim()) || 'Server name cannot be empty';
        },
      }), { isTextInput: true, getInputValue: () => buffer });

      if (res === NAV_BACK || res?.toLowerCase?.() === 'b' || res?.toLowerCase?.() === 'back') {
        step = 2;
        continue;
      }
      customName = res.trim();
      break;
    }
  }

  // Install MCP server configuration
  let targetHost = args.host;
  if (!targetHost) {
    const settings = await readSettings().catch(() => null);
    const activeSrv = (settings?.servers || []).find((s) => s.id === settings?.activeServerId);
    if (activeSrv && activeSrv.id !== 'local' && activeSrv.url) {
      try {
        const hostname = new URL(activeSrv.url).hostname;
        if (hostname && hostname !== '127.0.0.1' && hostname !== 'localhost') {
          targetHost = engineId === 'lmstudio' ? `http://${hostname}:1234/v1` : `http://${hostname}:11434`;
        }
      } catch {}
    }
  }

  const result = await installMcpServer({
    engineId,
    customName,
    agentIds: selectedAgents,
    host: targetHost,
    apiKey: args.apiKey,
  });

  // Report results
  if (result.updated.length) {
    const updatedNames = result.updated
      .map((id) => agents?.find((a) => a.id === id)?.name || id)
      .join(', ');
    console.log(c.g(`\n✓ ${t('cli.mcpSuccess', { server: customName, agents: updatedNames })}`));
  }

  if (result.errors?.length) {
    const errDetails = result.errors
      .map((e) => `${agents?.find((a) => a.id === e.agentId)?.name || e.agentId}: ${e.error}`)
      .join(', ');
    console.error(c.r(`\n✗ ${t('cli.mcpFailed', { agents: errDetails })}`));
  }
}
