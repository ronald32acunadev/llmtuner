import { test } from "node:test";
import assert from "node:assert/strict";
import {
  presetFilters,
  filterPresets,
  presetSummary,
} from "../src/web/public/presets-view.js";

const a = {
  engine: "ollama",
  model: "m1",
  ctx: 8192,
  profile: "speed",
  variant: "m1:q4",
  kvType: "q8_0",
  fullOffload: true,
  shortTps: 40,
  createdAt: "2026-10-31T10:20:30Z",
};

const b = {
  engine: "lmstudio",
  model: "m2",
  ctx: 16384,
  kvType: "f16",
  fullOffload: false,
  shortTps: 12,
  createdAt: "2026-10-30T00:00:00Z",
};

test("presetFilters", () => {
  const result = presetFilters([a, b]);
  assert.deepEqual(result, {
    engines: ["lmstudio", "ollama"],
    models: ["m1", "m2"],
  });
});

test("filterPresets empty filter", () => {
  const result = filterPresets([a, b], {});
  assert.deepEqual(result, [a, b]);
});

test("filterPresets engine ollama", () => {
  const result = filterPresets([a, b], { engine: "ollama" });
  assert.deepEqual(result, [a]);
});

test("filterPresets model m2", () => {
  const result = filterPresets([a, b], { model: "m2" });
  assert.deepEqual(result, [b]);
});

test("filterPresets engine ollama & model m2", () => {
  const result = filterPresets([a, b], { engine: "ollama", model: "m2" });
  assert.deepEqual(result, []);
});

const t = (key) => key;

test("presetSummary a", () => {
  const summary = presetSummary(a, t);
  assert.deepEqual(summary, {
    engine: "ollama",
    model: "m1",
    context: "8K",
    profile: "speed (m1:q4)",
    kv: "q8_0",
    offload: "candidate.allGpu",
    tps: "40 t/s",
    date: "2026-10-31 10:20",
  });
});

test("presetSummary b", () => {
  const summary = presetSummary(b, t);
  assert.deepEqual(summary, {
    engine: "lmstudio",
    model: "m2",
    context: "16K",
    profile: "",
    kv: "f16",
    offload: "cli.partial",
    tps: "12 t/s",
    date: "2026-10-30 00:00",
  });
});

test("presetSummary variant equal to model", () => {
  const summary = presetSummary({ ...a, variant: "m1" }, t);
  assert.deepEqual(summary, {
    engine: "ollama",
    model: "m1",
    context: "8K",
    profile: "speed",
    kv: "q8_0",
    offload: "candidate.allGpu",
    tps: "40 t/s",
    date: "2026-10-31 10:20",
  });
});
