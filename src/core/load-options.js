import { TunerError } from "./errors.js";

export function normalizeLoadOptions(options = {}) {
  const result = { ...options };

  result.force = options.force === undefined ? false : options.force;

  if (options.candidates === undefined) {
    result.candidates = 3;
  } else if (
    Number.isSafeInteger(options.candidates) &&
    options.candidates > 0
  ) {
    result.candidates = options.candidates;
  } else {
    throw new TunerError("errors.invalidCandidateCount");
  }

  if (options.dryRun === undefined) {
    result.dryRun = false;
  } else if (typeof options.dryRun === "boolean") {
    result.dryRun = options.dryRun;
  } else {
    throw new TunerError("errors.invalidLoadOption", { option: "dryRun" });
  }

  if (options.confirm !== undefined) {
    if (typeof options.confirm === 'boolean') {
      result.confirm = options.confirm;
    } else {
      throw new TunerError("errors.invalidLoadOption", { option: "confirm" });
    }
  } else {
    delete result.confirm;
  }

  return result;
}

export function loadOutcome(result, { dryRun = false } = {}) {
  if (dryRun) {
    return { ok: true, outcome: "preview" };
  }
  if (result?.applied === false) {
    return { ok: true, outcome: "declined" };
  }
  if (result?.applied?.pendingCommands?.length) {
    return { ok: false, outcome: "manual" };
  }
  if (result?.loaded?.ok) {
    return { ok: true, outcome: "loaded" };
  }
  return { ok: false, outcome: "failed" };
}
