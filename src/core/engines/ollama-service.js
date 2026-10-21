import fs from 'node:fs/promises';
import { run, fetchJson, sleep } from '../util.js';
import { TunerError } from '../errors.js';

const CONFIG = '/etc/systemd/system/ollama.service.d/llm-tuner.conf';
const KEYS = ['OLLAMA_FLASH_ATTENTION', 'OLLAMA_KV_CACHE_TYPE', 'OLLAMA_NUM_PARALLEL', 'CUDA_DEVICE_ORDER', 'CUDA_VISIBLE_DEVICES'];
const fail = () => { throw new TunerError('errors.ollamaServiceConfig'); };

export function validateServiceEnv(env) {
  if (!env || typeof env !== 'object' || Array.isArray(env) || Object.keys(env).some((k) => !KEYS.includes(k))) fail();
  if (!['0', '1'].includes(env.OLLAMA_FLASH_ATTENTION) || !['f16', 'q8_0', 'q4_0'].includes(env.OLLAMA_KV_CACHE_TYPE)) fail();
  if (typeof env.OLLAMA_NUM_PARALLEL !== 'string' || !/^[1-9]\d?$/.test(env.OLLAMA_NUM_PARALLEL) || Number(env.OLLAMA_NUM_PARALLEL) > 64) fail();
  if (env.CUDA_DEVICE_ORDER !== undefined || env.CUDA_VISIBLE_DEVICES !== undefined) {
    if (env.CUDA_DEVICE_ORDER !== 'PCI_BUS_ID' || typeof env.CUDA_VISIBLE_DEVICES !== 'string' || !/^(0|[1-9]\d{0,2})(,(0|[1-9]\d{0,2}))*$/.test(env.CUDA_VISIBLE_DEVICES)) fail();
    const ids = env.CUDA_VISIBLE_DEVICES.split(',');
    if (ids.length > 128 || ids.some((v) => Number(v) > 127) || new Set(ids).size !== ids.length) fail();
  }
  return Object.fromEntries(KEYS.filter((k) => env[k] !== undefined).map((k) => [k, env[k]]));
}

const configText = (env) => ['[Service]', ...Object.entries(env).map(([k, v]) => `Environment="${k}=${v}"`), ''].join('\n');
const matches = (live, env) => live && KEYS.every((k) => live[k] === env[k]);

// This operation is passed as literal argv, never read from a writable script.
// Both validation layers run before touching the fixed root-owned destination.
const SCRIPT = String.raw`set -eu
PATH=/usr/sbin:/usr/bin:/sbin:/bin
export PATH
umask 077
tmp=
trap 'rc=$?; test -z "$tmp" || rm -f -- "$tmp"; if test "$rc" != 0; then exit 70; fi' EXIT
test "$(id -u)" = 0
test "$#" = 5
case "$1" in 0|1) ;; *) exit 1;; esac
case "$2" in f16|q8_0|q4_0) ;; *) exit 1;; esac
case "$3" in ''|*[!0-9]*|0*) exit 1;; esac
test "$3" -ge 1 && test "$3" -le 64
if test -n "$4$5"; then
  test "$4" = PCI_BUS_ID
  case "$5" in ''|*[!0-9,]*|,*|*,|*,,*) exit 1;; esac
  oldifs=$IFS; IFS=,; seen=,
  for gpu in $5; do
    case "$gpu" in 0) ;; 0*) exit 1;; esac
    test "$gpu" -le 127
    case "$seen" in *,"$gpu",*) exit 1;; esac
    seen=$seen$gpu,
  done
  IFS=$oldifs
fi
trusted_dir() {
  test ! -L "$1" && test -d "$1" && test "$(stat -c %u "$1")" = 0 &&
    test -z "$(find "$1" -maxdepth 0 -perm /022 -print)"
}
for parent in /etc /etc/systemd /etc/systemd/system /run; do trusted_dir "$parent"; done
dir=/etc/systemd/system/ollama.service.d
file=/etc/systemd/system/ollama.service.d/llm-tuner.conf
lockdir=/run/llm-tuner
test ! -L "$dir" && test ! -L "$lockdir"
test -d "$dir" || mkdir -m 755 "$dir"
test -d "$lockdir" || mkdir -m 700 "$lockdir"
trusted_dir "$dir" && trusted_dir "$lockdir"
test ! -L "$lockdir/ollama.lock"
exec 9>"$lockdir/ollama.lock"
flock -n 9
if test -e "$file" || test -L "$file"; then
  test ! -L "$file" && test -f "$file" && test "$(stat -c %u "$file")" = 0
  test -z "$(find "$file" -maxdepth 0 -perm /022 -print)"
fi
body=$(printf '[Service]\nEnvironment="OLLAMA_FLASH_ATTENTION=%s"\nEnvironment="OLLAMA_KV_CACHE_TYPE=%s"\nEnvironment="OLLAMA_NUM_PARALLEL=%s"\n' "$1" "$2" "$3")
if test -n "$4"; then
  body=$(printf '%s\nEnvironment="CUDA_DEVICE_ORDER=%s"\nEnvironment="CUDA_VISIBLE_DEVICES=%s"\n' "$body" "$4" "$5")
fi
live_matches() {
  pid=$(systemctl show ollama.service --property=MainPID --value) || return 1
  case "$pid" in ''|*[!0-9]*|0) return 1;; esac
  live=$(tr '\000' '\n' < "/proc/$pid/environ") || return 1
  for pair in "OLLAMA_FLASH_ATTENTION=$1" "OLLAMA_KV_CACHE_TYPE=$2" "OLLAMA_NUM_PARALLEL=$3"; do
    printf '%s\n' "$live" | grep -Fxq -- "$pair" || return 1
  done
  if test -n "$4"; then
    printf '%s\n' "$live" | grep -Fxq -- "CUDA_DEVICE_ORDER=$4" || return 1
    printf '%s\n' "$live" | grep -Fxq -- "CUDA_VISIBLE_DEVICES=$5" || return 1
  elif printf '%s\n' "$live" | grep -Eq '^CUDA_(DEVICE_ORDER|VISIBLE_DEVICES)='; then
    return 1
  fi
  test "$pid" = "$(systemctl show ollama.service --property=MainPID --value)"
}
restarted=0
if ! live_matches "$@"; then restarted=1; fi
tmp=$(mktemp "$dir/.llm-tuner-XXXXXXXX")
printf '%s\n' "$body" > "$tmp"
chmod 644 "$tmp"
changed=0; backup=
if ! cmp -s "$file" "$tmp"; then
  if test -f "$file"; then
    backup=$(mktemp "$file.bak-llm-tuner-XXXXXXXX")
    cp -p -- "$file" "$backup"
  fi
  mv -f -- "$tmp" "$file"
  tmp=; changed=1
fi
if test "$changed$restarted" != 00; then systemctl daemon-reload; fi
if test "$restarted" = 1; then systemctl restart ollama.service; fi
live_matches "$@"
printf 'changed=%s\nrestarted=%s\nbackup=%s\n' "$changed" "$restarted" "$backup"
`;

export function serviceInvocation(input) {
  const env = validateServiceEnv(input);
  // The elevated watchdog can terminate the privileged process group; its
  // unprivileged parent cannot reliably signal a root shell after pkexec.
  return { command: '/usr/bin/timeout', args: ['--signal=TERM', '--kill-after=5s', '45s', '/bin/sh', '-c', SCRIPT, 'llm-tuner-ollama', ...KEYS.map((k) => env[k] ?? '')] };
}

export const serviceIO = {
  async inspect(env) {
    try {
      const query = () => run('/usr/bin/systemctl', ['show', 'ollama.service', '--property=MainPID', '--value']);
      const p = await query();
      if (p.code || !/^[1-9]\d*$/.test(p.stdout.trim())) return null;
      for (const target of ['/etc', '/etc/systemd', '/etc/systemd/system', '/etc/systemd/system/ollama.service.d', CONFIG]) {
        const st = await fs.lstat(target);
        if (st.isSymbolicLink() || st.uid !== 0 || (st.mode & 0o022)) return null;
      }
      if (await fs.readFile(CONFIG, 'utf8') !== configText(env)) return null;
      const raw = await fs.readFile(`/proc/${p.stdout.trim()}/environ`, 'utf8');
      const again = await query();
      if (again.code || p.stdout !== again.stdout) return null;
      return Object.fromEntries(raw.split('\0').filter((v) => v.includes('=')).map((v) => [v.slice(0, v.indexOf('=')), v.slice(v.indexOf('=') + 1)]));
    } catch { return null; }
  },
  async ready(apiUrl) {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if ((await fetchJson(`${apiUrl}/api/version`, { timeout: 1000 }))?.ok) return true;
      await sleep(250);
    }
    return false;
  },
};

export function validateServiceTarget(apiUrl) {
  let url;
  try { url = new URL(apiUrl); } catch { throw new TunerError('errors.ollamaServiceTarget'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.port !== '11434' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new TunerError('errors.ollamaServiceTarget');
  return url.origin;
}

export async function reconcileOllamaService(apiUrl, input, { authorize } = {}) {
  const origin = validateServiceTarget(apiUrl);
  const env = validateServiceEnv(input);
  if (matches(await serviceIO.inspect(env), env)) return { changed: false, restarted: false, backups: [] };
  if (typeof authorize !== 'function') throw new TunerError('errors.ollamaAuthorizationRequired');
  const result = await authorize({ operation: 'ollama-service-env', env });
  if (!result || typeof result.changed !== 'boolean' || typeof result.restarted !== 'boolean' || !Array.isArray(result.backups) || result.backups.some((b) => typeof b !== 'string')) throw new TunerError('errors.ollamaAuthorizationFailed');
  if (!(await serviceIO.ready(origin))) throw new TunerError('errors.ollamaServiceReady');
  return result;
}
