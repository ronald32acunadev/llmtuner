import { exists } from '../util.js';
import { SUPPORTED_AGENTS, resolveConfigPath, buildMcpPayload } from './registry.js';
import { readJsonMcpServers, upsertJsonMcpServer } from './adapters/json-adapter.js';
import { readTomlMcpServers, upsertTomlMcpServer } from './adapters/toml-adapter.js';

export { SUPPORTED_AGENTS, resolveConfigPath, buildMcpPayload };

export async function detectAgents({ platform, env, homedir } = {}) {
  const results = [];

  for (const agent of SUPPORTED_AGENTS) {
    const configPath = resolveConfigPath(agent.id, { platform, env, homedir });
    const fileExists = await exists(configPath);

    let configuredServers = [];
    if (fileExists) {
      try {
        if (agent.format === 'toml') {
          configuredServers = await readTomlMcpServers(configPath);
        } else {
          configuredServers = await readJsonMcpServers(configPath, agent.rootKey);
        }
      } catch {
        configuredServers = [];
      }
    }

    results.push({
      id: agent.id,
      name: agent.name,
      format: agent.format,
      configPath,
      detected: fileExists,
      configuredServers
    });
  }

  return results;
}

export async function installMcpServer(
  { engineId, customName, agentIds = [], host, apiKey },
  { platform, env, homedir } = {}
) {
  if (!engineId || !customName) {
    throw new Error('engineId and customName are required');
  }

  const payload = buildMcpPayload(engineId, { customName, host, apiKey });
  const updated = [];
  const errors = [];

  for (const agentId of agentIds) {
    const agent = SUPPORTED_AGENTS.find((a) => a.id === agentId);
    if (!agent) {
      errors.push({ agentId, error: `Unsupported agent ID: ${agentId}` });
      continue;
    }

    try {
      const configPath = resolveConfigPath(agentId, { platform, env, homedir });

      if (agent.format === 'toml') {
        await upsertTomlMcpServer(configPath, customName, payload);
      } else {
        await upsertJsonMcpServer(
          configPath,
          agent.rootKey,
          customName,
          payload,
          { isOpenCode: agent.isOpenCode }
        );
      }

      updated.push(agentId);
    } catch (err) {
      errors.push({ agentId, error: err.message });
    }
  }

  return { success: errors.length === 0, updated, errors };
}
