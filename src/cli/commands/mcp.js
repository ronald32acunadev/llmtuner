import { select, checkbox, input } from '@inquirer/prompts';
import { detectHardware, detectEngines, detectAgents, installMcpServer } from '../../core/index.js';
import { t as translate } from '../../i18n/index.js';
import { getColors } from '../colors.js';

export async function mcpCommand(args, { lang, theme }) {
  const c = getColors(theme);
  const t = (key, params) => translate(lang, key, params);

  // 1. Select Engine
  let engineId = args.engine;
  if (!engineId) {
    const hw = await detectHardware();
    const det = await detectEngines(hw);
    engineId = await select({
      message: t('cli.mcpSelectEngine'),
      default: det.recommended || 'lmstudio',
      choices: [
        { name: 'LM Studio', value: 'lmstudio' },
        { name: 'Ollama', value: 'ollama' },
      ],
    });
  }

  // 2. Detect supported AI agents
  const agents = await detectAgents();

  // 3. Multi-select agents to configure
  const selectedAgents = await checkbox({
    message: t('cli.mcpSelectAgents'),
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
  });

  if (!selectedAgents.length) {
    console.log(c.y(t('cli.mcpNoAgentsSelected')));
    return;
  }

  // 4. Prompt for custom MCP server name
  const customName = args.name || await input({
    message: t('cli.mcpServerNamePrompt'),
    default: engineId,
    validate: (val) => Boolean(val.trim()) || 'Server name cannot be empty',
  });

  // 5. Install MCP server configuration
  const result = await installMcpServer({
    engineId,
    customName: customName.trim(),
    agentIds: selectedAgents,
    host: args.host,
    apiKey: args.apiKey,
  });

  // 6. Report results
  if (result.updated.length) {
    const updatedNames = result.updated
      .map((id) => agents.find((a) => a.id === id)?.name || id)
      .join(', ');
    console.log(c.g(`\n✓ ${t('cli.mcpSuccess', { server: customName, agents: updatedNames })}`));
  }

  if (result.errors?.length) {
    const errDetails = result.errors
      .map((e) => `${agents.find((a) => a.id === e.agentId)?.name || e.agentId}: ${e.error}`)
      .join(', ');
    console.error(c.r(`\n✗ ${t('cli.mcpFailed', { agents: errDetails })}`));
  }
}
