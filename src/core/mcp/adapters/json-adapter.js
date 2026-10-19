import { readJson, writeJsonWithBackup } from '../../util.js';

export async function readJsonMcpServers(filePath, rootKey) {
  const data = (await readJson(filePath, {})) || {};
  return Object.keys(data[rootKey] || {});
}

export async function upsertJsonMcpServer(
  filePath,
  rootKey,
  serverName,
  serverConfig,
  { isOpenCode = false } = {}
) {
  const data = (await readJson(filePath, {})) || {};

  if (!data[rootKey] || typeof data[rootKey] !== 'object') {
    data[rootKey] = {};
  }

  if (isOpenCode) {
    data[rootKey][serverName] = {
      type: 'local',
      command: [serverConfig.command, ...(serverConfig.args || [])],
      environment: serverConfig.env || {}
    };
  } else {
    data[rootKey][serverName] = {
      command: serverConfig.command,
      args: serverConfig.args || [],
      ...(serverConfig.env ? { env: serverConfig.env } : {})
    };
  }

  const backup = await writeJsonWithBackup(filePath, data, { indent: 2 });
  return { backup };
}
