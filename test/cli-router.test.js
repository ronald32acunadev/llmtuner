import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCliArgs } from '../src/cli/router.js';

test('parseCliArgs - slash commands', () => {
  assert.equal(parseCliArgs(['/load']).command, 'load');
  assert.equal(parseCliArgs(['load']).command, 'load');
  assert.equal(parseCliArgs(['/mcp']).command, 'mcp');
  assert.equal(parseCliArgs(['mcp']).command, 'mcp');
  assert.equal(parseCliArgs(['/presets']).command, 'presets');
  assert.equal(parseCliArgs(['presets']).command, 'presets');
  assert.equal(parseCliArgs(['/settings']).command, 'settings');
  assert.equal(parseCliArgs(['settings']).command, 'settings');
  assert.equal(parseCliArgs(['/help']).command, 'help');
  assert.equal(parseCliArgs(['help']).command, 'help');
  assert.equal(parseCliArgs(['/exit']).command, 'exit');
  assert.equal(parseCliArgs(['exit']).command, 'exit');
});

test('parseCliArgs - short flags', () => {
  const h = parseCliArgs(['-h']);
  assert.equal(h.command, 'help');
  assert.equal(h.help, true);

  const v = parseCliArgs(['-v']);
  assert.equal(v.command, 'version');
  assert.equal(v.version, true);
});

test('parseCliArgs - double-dash action flags', () => {
  const help = parseCliArgs(['--help']);
  assert.equal(help.command, 'help');
  assert.equal(help.help, true);

  const ver = parseCliArgs(['--version']);
  assert.equal(ver.command, 'version');
  assert.equal(ver.version, true);

  const presets = parseCliArgs(['--presets']);
  assert.equal(presets.command, 'presets');
  assert.equal(presets.presets, true);

  const settings = parseCliArgs(['--settings']);
  assert.equal(settings.command, 'settings');
  assert.equal(settings.settings, true);
});

test('parseCliArgs - tuning flags default command to load', () => {
  const res = parseCliArgs(['--engine', 'lmstudio', '--model', 'qwen', '--ctx', '8192']);
  assert.equal(res.command, 'load');
  assert.equal(res.engine, 'lmstudio');
  assert.equal(res.model, 'qwen');
  assert.equal(res.ctx, '8192');

  const boolTuning = parseCliArgs(['--dry-run', '--yes', '--force', '--json']);
  assert.equal(boolTuning.command, 'load');
  assert.equal(boolTuning['dry-run'], true);
  assert.equal(boolTuning.dryRun, true);
  assert.equal(boolTuning.yes, true);
  assert.equal(boolTuning.force, true);
  assert.equal(boolTuning.json, true);
});

test('parseCliArgs - explicit slash command preserves flags', () => {
  const res = parseCliArgs(['/load', '--engine', 'ollama', '--candidates', '5']);
  assert.equal(res.command, 'load');
  assert.equal(res.engine, 'ollama');
  assert.equal(res.candidates, '5');

  const presets = parseCliArgs(['/presets', '--engine', 'lmstudio']);
  assert.equal(presets.command, 'presets');
  assert.equal(presets.engine, 'lmstudio');
});

test('parseCliArgs - empty args or only global flags default to menu', () => {
  assert.equal(parseCliArgs([]).command, 'menu');

  const langOnly = parseCliArgs(['--lang', 'es']);
  assert.equal(langOnly.command, 'menu');
  assert.equal(langOnly.lang, 'es');

  const themeOnly = parseCliArgs(['--theme', 'dark']);
  assert.equal(themeOnly.command, 'menu');
  assert.equal(themeOnly.theme, 'dark');

  const both = parseCliArgs(['--lang', 'en', '--theme', 'light']);
  assert.equal(both.command, 'menu');
  assert.equal(both.lang, 'en');
  assert.equal(both.theme, 'light');
});
