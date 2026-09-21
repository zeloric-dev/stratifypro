#!/usr/bin/env node
/**
 * Emit this resolver's answer for every benchmark row as JSONL.
 *
 * There is deliberately no scorer here. bench/identity/run.py already defines
 * precision, recall, F1, abstention and the unknown-class false-positive rate,
 * and the published baselines were measured with it. A second scorer would be
 * two implementations of the numbers that are this project's public credential,
 * which is exactly the drift the crosswalk round-trip discipline exists to
 * prevent. This produces predictions; that runner scores them.
 *
 *   node dist/emit-predictions.js > /tmp/preds.jsonl
 *   python3 bench/identity/run.py --predictions /tmp/preds.jsonl
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve, type AliasDictionary } from './index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolvePath(HERE, '..', '..', '..');

const dict = (
  JSON.parse(readFileSync(join(ROOT, 'packages', 'rules', 'data', 'alias-dictionary.json'), 'utf8')) as {
    entries: AliasDictionary;
  }
).entries;

const rows = readFileSync(join(ROOT, 'bench', 'identity', 'dataset.jsonl'), 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .map((l) => JSON.parse(l) as { input: string });

const out: string[] = [];
for (const row of rows) {
  const r = resolve(row.input, dict);
  out.push(
    JSON.stringify({
      input: row.input,
      purl: r ? r.purlBase : null,
      method: r ? r.method : 'abstain',
    }),
  );
}
process.stdout.write(out.join('\n') + '\n');
