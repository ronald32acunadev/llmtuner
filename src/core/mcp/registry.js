import os from 'node:os';
import path from 'node:path';

export const SUPPORTED_AGENTS = [
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    format: 'json',
    rootKey: 'mcpServers'
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    format: 'json',
    rootKey: 'mcpServers'
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    format: 'json',
    rootKey: 'mcp',
    isOpenCode: true
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    format: 'json',
    rootKey: 'mcpServers'
  },
  {
    id: 'vscode',
    name: 'VS Code',
    format: 'json',
    rootKey: 'servers'
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT / Codex',
    format: 'toml'
  }
];

export function resolveConfigPath(agentId, { platform = process.platform, env = process.env, homedir = os.homedir() } = {}) {
  const p = platform === 'win32' ? path.win32 : path.posix;

  switch (agentId) {
    case 'claude-desktop': {
      if (platform === 'darwin') {
        return p.join(homedir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
      }
      if (platform === 'win32') {
        const appData = env.APPDATA || p.join(homedir, 'AppData', 'Roaming');
        return p.join(appData, 'Claude', 'claude_desktop_config.json');
      }
      const configDir = env.XDG_CONFIG_HOME || p.join(homedir, '.config');
      return p.join(configDir, 'Claude', 'claude_desktop_config.json');
    }
    case 'claude-code': {
      const userProfile = (platform === 'win32' && env.USERPROFILE) ? env.USERPROFILE : homedir;
      return p.join(userProfile, '.claude.json');
    }
    case 'opencode': {
      if (platform === 'darwin') {
        return p.join(homedir, 'Library', 'Application Support', 'opencode', 'opencode.json');
      }
      if (platform === 'win32') {
        const appData = env.APPDATA || p.join(homedir, 'AppData', 'Roaming');
        return p.join(appData, 'opencode', 'opencode.json');
      }
      const configDir = env.XDG_CONFIG_HOME || p.join(homedir, '.config');
      return p.join(configDir, 'opencode', 'opencode.json');
    }
    case 'antigravity': {
      const userProfile = (platform === 'win32' && env.USERPROFILE) ? env.USERPROFILE : homedir;
      return p.join(userProfile, '.gemini', 'config', 'mcp_config.json');
    }
    case 'vscode': {
      if (platform === 'darwin') {
        return p.join(homedir, 'Library', 'Application Support', 'Code', 'User', 'mcp.json');
      }
      if (platform === 'win32') {
        const appData = env.APPDATA || p.join(homedir, 'AppData', 'Roaming');
        return p.join(appData, 'Code', 'User', 'mcp.json');
      }
      const configDir = env.XDG_CONFIG_HOME || p.join(homedir, '.config');
      return p.join(configDir, 'Code', 'User', 'mcp.json');
    }
    case 'chatgpt': {
      const userProfile = (platform === 'win32' && env.USERPROFILE) ? env.USERPROFILE : homedir;
      return p.join(userProfile, '.codex', 'config.toml');
    }
    default:
      throw new Error(`Unsupported agent ID: ${agentId}`);
  }
}

export function buildMcpPayload(engineId, { customName, host, apiKey } = {}) {
  switch (engineId) {
    case 'lmstudio': {
      return {
        command: 'npx',
        args: ['-y', '@mzxrai/mcp-openai@latest'],
        env: {
          OPENAI_BASE_URL: host || 'http://127.0.0.1:1234/v1',
          OPENAI_API_KEY: apiKey || 'sk-lm-local'
        }
      };
    }
    case 'ollama': {
      return {
        command: 'npx',
        args: ['-y', 'ollama-mcp-server@latest'],
        env: {
          OLLAMA_HOST: host || 'http://127.0.0.1:11434'
        }
      };
    }
    default:
      throw new Error(`Unsupported engine ID: ${engineId}`);
  }
}
