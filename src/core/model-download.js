import { TunerError } from './errors.js';

const MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/;
const MAX_NAME_LENGTH = 256;
const PLAN_ARGS = {
  ollama: (name) => ['pull', name],
  lmstudio: (name) => ['get', name, '-y'],
};

export function isValidModelName(name) {
  return typeof name === 'string' && name.length <= MAX_NAME_LENGTH && MODEL_NAME.test(name);
}

export async function downloadModel({ engineId, name, bin, onLine = () => {}, runInstall }) {
  if (!Object.hasOwn(PLAN_ARGS, engineId)) {
    throw new TunerError('errors.unknownEngine', { engine: engineId });
  }
  const trimmed = typeof name === 'string' ? name.trim() : name;
  if (!isValidModelName(trimmed)) {
    throw new TunerError('errors.invalidModelName');
  }
  if (!bin) {
    throw new TunerError('errors.installNotFinished');
  }
  return runInstall({ cmd: bin, args: PLAN_ARGS[engineId](trimmed) }, onLine);
}
