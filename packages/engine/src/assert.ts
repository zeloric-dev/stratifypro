/**
 * Assertion operators.
 *
 * Supports exactly the forms the shipped packs use. If a pack needs a new one,
 * add it to packages/rules/src/reference-engine.py first and here second, and
 * make them agree. The golden artifact will tell you if they do not.
 *
 * matchesAny is deliberately absent. It evaluated as a substring search over
 * the whole serialised document rather than the selected node, which made rule
 * CISA-PR-004 pass on 12 of 13 SPDX corpus files because syft and tern emit
 * NOASSERTION into empty fields automatically. It was removed from the pack and
 * is used by no rule. Do not add it back.
 */

import { jsonPath, pyStr, truthy, type Json } from './jsonpath.js';

function isRecord(v: Json): v is Record<string, Json> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export interface Assertion {
  allOf?: Assertion[];
  anyOf?: Assertion[];
  not?: Assertion;
  exists?: string;
  matches?: string;
  equals?: Record<string, Json>;
  minLength?: { field?: string; min?: number };
  oneOf?: unknown;
}

/**
 * 'a.b' walks a path from the node. 'a|b' tries each alternative.
 * A segment containing a bracket is handed to the JSONPath walker instead.
 */
function has(node: Json, expr: string): boolean {
  for (const alt of expr.split('|')) {
    let cur: Json = node;
    let ok = true;
    for (const k of alt.replace('$.', '').split('.')) {
      if (k.endsWith(']') || k.includes('[')) {
        const base = isRecord(cur) || Array.isArray(cur) ? cur : {};
        const sub = jsonPath(base, '$.' + alt.replace('$.', ''));
        if (sub.some(truthy)) return true;
        ok = false;
        break;
      }
      if (isRecord(cur) && k in cur) {
        cur = cur[k];
      } else if (Array.isArray(cur)) {
        const found = cur.filter((x): x is Record<string, Json> => isRecord(x) && k in x).map((x) => x[k]);
        if (found.length === 0) {
          ok = false;
          break;
        }
        cur = found;
      } else {
        ok = false;
        break;
      }
    }
    if (ok && truthy(cur)) return true;
  }
  return false;
}

/** True when the assertion HOLDS, meaning no finding. */
export function evaluate(a: Assertion, node: Json, doc: Json): boolean {
  if (a.allOf) return a.allOf.every((x) => evaluate(x, node, doc));
  if (a.anyOf) return a.anyOf.some((x) => evaluate(x, node, doc));
  if (a.not) return !evaluate(a.not, node, doc);

  if (a.exists !== undefined) {
    const e = a.exists;
    return has(node, e) || (e.startsWith('$') && jsonPath(doc, e).some(truthy));
  }

  if (a.matches !== undefined) {
    const vals: Json[] =
      typeof node === 'string' ? [node] : isRecord(node) ? Object.values(node) : [];
    const re = new RegExp(a.matches);
    return vals.some((v) => typeof v === 'string' && re.test(v));
  }

  if (a.equals !== undefined) {
    if (!isRecord(node)) return false;
    return Object.entries(a.equals).some(
      ([k, v]) => pyStr(k in node ? node[k] : '').toLowerCase() === pyStr(v).toLowerCase(),
    );
  }

  if (a.minLength !== undefined) {
    const m = a.minLength;
    const field = m.field ?? '';
    const min = m.min ?? 1;
    for (const alt of field.split('|')) {
      const v = jsonPath(doc, alt.startsWith('$') ? alt : '$.' + alt);
      const first = v[0];
      if (v.length > 0 && Array.isArray(first) && first.length >= min) return true;
    }
    return false;
  }

  // Vocabulary checks need a data file the loader does not currently pass in.
  // Returning true means this operator can never produce a finding, which is
  // why no rule uses it and why the rule that claimed to has its claim in its
  // title corrected rather than pretended.
  if (a.oneOf !== undefined) return true;

  return true;
}
