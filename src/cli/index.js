#!/usr/bin/env node
import { routeCli } from './router.js';

try {
  const code = await routeCli(process.argv.slice(2));
  if (typeof code === 'number' && code !== 0) {
    process.exit(code);
  }
} catch (e) {
  if (e?.name === 'ExitPromptError') {
    process.exit(130);
  }
  console.error(`\nError: ${e.message || e}`);
  process.exit(1);
}
