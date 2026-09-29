import os from 'node:os';
import { spawn } from 'node:child_process';
import { which, PLATFORM } from './util.js';

/**
 * Official install routes per engine and OS. Every plan is shown to the user
 * before running; nothing is installed silently.
 */
export async function installPlans(engineId) {
  const brew = PLATFORM === 'darwin' ? await which('brew') : null;
  const winget = PLATFORM === 'win32' ? await which('winget') : null;
  const arch = os.arch() === 'arm64' ? 'arm64' : 'x64';
  const plans = [];

  if (engineId === 'ollama') {
    if (PLATFORM === 'linux') plans.push({ id: 'script', labelCode: 'install.ollamaScript', shell: 'curl -fsSL https://ollama.com/install.sh | sh', needsSudo: true });
    if (PLATFORM === 'darwin') {
      if (brew) plans.push({ id: 'brew', labelCode: 'install.ollamaBrew', cmd: 'brew', args: ['install', '--cask', 'ollama'] });
      plans.push({ id: 'dmg', labelCode: 'install.ollamaDmg', url: 'https://ollama.com/download/Ollama.dmg', manual: true });
    }
    if (PLATFORM === 'win32') {
      if (winget) plans.push({ id: 'winget', labelCode: 'install.ollamaWinget', cmd: 'winget', args: ['install', '-e', '--id', 'Ollama.Ollama', '--accept-source-agreements', '--accept-package-agreements'] });
      plans.push({ id: 'ps1', labelCode: 'install.ollamaPs1', cmd: 'powershell', args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'irm https://ollama.com/install.ps1 | iex'] });
    }
  }

  if (engineId === 'lmstudio') {
    if (PLATFORM === 'linux' || PLATFORM === 'darwin') {
      plans.push({ id: 'llmster', labelCode: 'install.lmsHeadless', shell: 'curl -fsSL https://lmstudio.ai/install.sh | bash' });
    }
    if (PLATFORM === 'darwin' && brew) plans.push({ id: 'brew', labelCode: 'install.lmsBrew', cmd: 'brew', args: ['install', '--cask', 'lm-studio'] });
    if (PLATFORM === 'win32') {
      if (winget) plans.push({ id: 'winget', labelCode: 'install.lmsWinget', cmd: 'winget', args: ['install', '-e', '--id', 'ElementLabs.LMStudio', '--accept-source-agreements', '--accept-package-agreements'] });
      plans.push({ id: 'ps1', labelCode: 'install.lmsHeadlessPs1', cmd: 'powershell', args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'irm https://lmstudio.ai/install.ps1 | iex'] });
    }
    const plat = { linux: 'linux', darwin: 'darwin', win32: 'win32' }[PLATFORM];
    plans.push({ id: 'download', labelCode: 'install.lmsDownload', url: `https://lmstudio.ai/download/latest/${plat}/${arch}`, manual: true });
  }
  return plans;
}

/** Run an install plan, streaming output lines to `onLine`. Resolves exit code. */
export function runInstall(plan, onLine = () => {}) {
  if (plan.manual) {
    openUrl(plan.url);
    return Promise.resolve({ code: 0, manual: true });
  }
  const child = plan.shell
    ? spawn(PLATFORM === 'win32' ? 'cmd' : 'sh', PLATFORM === 'win32' ? ['/c', plan.shell] : ['-c', plan.shell], { stdio: ['inherit', 'pipe', 'pipe'] })
    : spawn(plan.cmd, plan.args, { stdio: ['inherit', 'pipe', 'pipe'], windowsHide: true });
  child.stdout.on('data', (d) => String(d).split(/\r?\n/).filter(Boolean).forEach(onLine));
  child.stderr.on('data', (d) => String(d).split(/\r?\n/).filter(Boolean).forEach(onLine));
  return new Promise((resolve) => child.on('exit', (code) => resolve({ code })));
}

export function openUrl(url) {
  const [cmd, args] = PLATFORM === 'win32' ? ['cmd', ['/c', 'start', '', url]] : PLATFORM === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
}
