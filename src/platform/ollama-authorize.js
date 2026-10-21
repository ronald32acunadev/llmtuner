import { spawn } from 'node:child_process';
import { serviceInvocation } from '../core/engines/ollama-service.js';
import { TunerError } from '../core/errors.js';

export const authorizationIO = { spawn };

function parseResult(stdout) {
  const fields = Object.create(null);
  for (const line of stdout.trimEnd().split('\n')) {
    const index = line.indexOf('=');
    const key = line.slice(0, index);
    if (index < 0 || !['changed', 'restarted', 'backup'].includes(key) || Object.hasOwn(fields, key)) throw new TunerError('errors.ollamaAuthorizationFailed');
    fields[key] = line.slice(index + 1);
  }
  if (!['0', '1'].includes(fields.changed) || !['0', '1'].includes(fields.restarted) || typeof fields.backup !== 'string' || (fields.backup && !/^\/etc\/systemd\/system\/ollama\.service\.d\/llm-tuner\.conf\.bak-llm-tuner-[A-Za-z0-9]+$/.test(fields.backup))) throw new TunerError('errors.ollamaAuthorizationFailed');
  return { changed: fields.changed === '1', restarted: fields.restarted === '1', backups: fields.backup ? [fields.backup] : [] };
}

/** The interface chooses interaction, never the operation or its destinations. */
export function createOllamaAuthorizer({ mode = 'noninteractive', beforePrompt = () => {}, afterPrompt = () => {} } = {}) {
  if (!['desktop', 'terminal', 'noninteractive'].includes(mode)) throw new TunerError('errors.ollamaServiceConfig');
  return async (request) => {
    if (!request || request.operation !== 'ollama-service-env' || Object.keys(request).some((k) => !['operation', 'env'].includes(k))) throw new TunerError('errors.ollamaServiceConfig');
    const { command, args } = serviceInvocation(request.env);
    const bin = mode === 'desktop' ? '/usr/bin/pkexec' : '/usr/bin/sudo';
    const prefix = mode === 'desktop' ? ['--disable-internal-agent'] : mode === 'noninteractive' ? ['-n', '--'] : ['--'];
    const terminal = mode === 'terminal';
    try {
      if (terminal) await beforePrompt();
      return await new Promise((resolve, reject) => {
        let child, timer, output = '', settled = false, pendingFailure;
        const finish = (error, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) reject(error); else resolve(value);
        };
        const failed = () => new TunerError('errors.ollamaAuthorizationFailed');
        const stop = () => {
          pendingFailure = failed();
          // A signal request is not proof of termination. Retain ownership
          // until close, even if the OS refuses to signal the elevated child.
          try { child.kill('SIGTERM'); } catch { /* wait for the elevated watchdog */ }
        };
        try {
          child = authorizationIO.spawn(bin, [...prefix, command, ...args], {
            env: { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C' },
            stdio: terminal ? ['inherit', 'pipe', 'inherit'] : ['ignore', 'pipe', 'pipe'],
          });
        } catch (e) {
          finish(new TunerError(e.code === 'ENOENT' ? 'errors.ollamaAuthorizationUnavailable' : 'errors.ollamaAuthorizationFailed'));
          return;
        }
        timer = setTimeout(stop, 60000);
        child.stdout?.on('data', (chunk) => {
          if (pendingFailure) return;
          output += String(chunk);
          if (Buffer.byteLength(output) > 16384) { output = ''; stop(); }
        });
        // Drain diagnostics without collecting passwords or returning raw privileged output.
        child.stderr?.resume();
        child.on('error', (e) => {
          const error = new TunerError(e.code === 'ENOENT' ? 'errors.ollamaAuthorizationUnavailable' : 'errors.ollamaAuthorizationFailed');
          if (!child.pid) finish(error); else pendingFailure = error;
        });
        child.on('close', (code, signal) => {
          if (pendingFailure) { finish(pendingFailure); return; }
          if (code !== 0 || signal) {
            finish(new TunerError(mode === 'desktop' && code === 126 ? 'errors.ollamaAuthorizationCancelled' : mode === 'noninteractive' && code === 1 ? 'errors.ollamaAuthorizationRequired' : 'errors.ollamaAuthorizationFailed'));
            return;
          }
          try { finish(null, parseResult(output)); } catch (e) { finish(e); }
        });
      });
    } finally {
      if (terminal) await afterPrompt();
    }
  };
}
