#!/usr/bin/env node
/**
 * The command that builds the mirror. Kept apart from index.ts so that
 * importing the builder never runs it, and so the one file with a shebang is
 * the one a person actually invokes.
 */
import { join } from 'node:path';
import { build } from './index.js';

const argv = process.argv.slice(2);
const i = argv.indexOf('--out');
const out = i !== -1 && argv[i + 1] ? (argv[i + 1] as string) : join(process.cwd(), '.mirror');

build({ out }).then(
  () => process.exit(0),
  (e: Error) => {
    process.stderr.write(`  FAILED: ${e.message}\n`);
    process.exit(1);
  },
);
