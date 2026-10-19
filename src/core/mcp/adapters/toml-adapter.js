import fs from 'node:fs/promises';
import path from 'node:path';
import { exists, timestamp } from '../../util.js';

export async function readTomlMcpServers(filePath) {
  if (!(await exists(filePath))) return [];

  const content = await fs.readFile(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const serverNames = new Set();

  for (const raw of lines) {
    const line = raw.trim();
    const match = line.match(/^\[mcp_servers\.([A-Za-z0-9_-]+)\]\s*$/);
    if (match) {
      serverNames.add(match[1]);
    }
  }

  return [...serverNames];
}

export async function upsertTomlMcpServer(filePath, serverName, serverConfig) {
  let content = '';
  let backup = null;

  if (await exists(filePath)) {
    const backupPath = `${filePath}.bak-llm-tuner-${timestamp()}`;
    await fs.copyFile(filePath, backupPath);
    backup = backupPath;
    content = await fs.readFile(filePath, 'utf8');
  } else {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    content = '';
  }

  const lines = content.split(/\r?\n/);
  const newLines = [];
  let skipping = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('[')) {
      if (
        trimmed === `[mcp_servers.${serverName}]` ||
        trimmed.startsWith(`[mcp_servers.${serverName}.`)
      ) {
        skipping = true;
        continue;
      }
      skipping = false;
    }

    if (!skipping) {
      newLines.push(line);
    }
  }

  let baseContent = newLines.join('\n').trim();
  if (baseContent.length > 0) {
    baseContent += '\n\n';
  }

  let tomlBlock = `[mcp_servers.${serverName}]\n`;
  tomlBlock += `command = ${JSON.stringify(serverConfig.command)}\n`;
  tomlBlock += `args = ${JSON.stringify(serverConfig.args || [])}\n`;

  if (serverConfig.env && typeof serverConfig.env === 'object' && Object.keys(serverConfig.env).length > 0) {
    tomlBlock += `\n[mcp_servers.${serverName}.env]\n`;
    for (const [key, value] of Object.entries(serverConfig.env)) {
      tomlBlock += `${key} = ${JSON.stringify(String(value))}\n`;
    }
  }

  const finalContent = baseContent + tomlBlock;
  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.tmp-${process.pid}`);
  await fs.writeFile(tempPath, finalContent, 'utf8');
  await fs.rename(tempPath, filePath);

  return { backup };
}
