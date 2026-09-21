/**
 * Minimal JSONPath. Handles $.a.b, $.a[*], $.a[?(@.k=='v')], $.a[0], and $ alone.
 *
 * This is a deliberate port of packages/rules/src/reference-engine.py, which is
 * the oracle this engine is checked against. Where the two could differ they
 * must not, so the Python quirks are reproduced here on purpose and noted where
 * they are surprising.
 */

export type Json = unknown;

export interface PathNode {
  /** Concrete path, e.g. $.components[7]. This is what a Finding carries. */
  path: string;
  node: Json;
}

const TOKEN =
  /\.([A-Za-z_][\w-]*)|\[(\*)\]|\[\?\(@\.([\w-]+)\s*==\s*['"]([^'"]+)['"]\)\]|\[(\d+)\]/g;

function isRecord(v: Json): v is Record<string, Json> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** (concrete path, node) pairs for every node the selector reaches. */
export function jsonPathNodes(doc: Json, path: string): PathNode[] {
  if (path === '$') return [{ path: '$', node: doc }];

  let cur: PathNode[] = [{ path: '$', node: doc }];
  TOKEN.lastIndex = 0;
  for (const m of path.matchAll(TOKEN)) {
    const key = m[1];
    const star = m[2];
    const filterKey = m[3];
    const filterVal = m[4];
    const index = m[5];
    const next: PathNode[] = [];

    for (const { path: p, node: n } of cur) {
      if (key !== undefined) {
        if (isRecord(n) && key in n) next.push({ path: `${p}.${key}`, node: n[key] });
      } else if (star !== undefined) {
        if (Array.isArray(n)) {
          n.forEach((x, i) => next.push({ path: `${p}[${i}]`, node: x }));
        }
      } else if (filterKey !== undefined) {
        if (Array.isArray(n)) {
          n.forEach((x, i) => {
            // String() to match Python's str() coercion before comparison.
            if (isRecord(x) && String(x[filterKey]) === filterVal) {
              next.push({ path: `${p}[${i}]`, node: x });
            }
          });
        }
      } else if (index !== undefined) {
        const i = Number(index);
        if (Array.isArray(n) && i < n.length) next.push({ path: `${p}[${index}]`, node: n[i] });
      }
    }
    cur = next;
  }
  return cur;
}

/** Nodes only. The assert operators do not need paths. */
export function jsonPath(doc: Json, path: string): Json[] {
  return jsonPathNodes(doc, path).map((x) => x.node);
}

/**
 * Whether a value counts as present.
 *
 * NOASSERTION is treated as absent. A generator writing that token into an
 * empty field has not supplied the information, and counting it as present is
 * how a file full of machine filler reads as complete.
 *
 * Note the final `true`: a number, including 0, counts as present. That is the
 * reference implementation's behaviour and 0 is a legitimate value, not a gap.
 */
export function truthy(v: Json): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') {
    const s = v.trim();
    return s !== '' && s.toUpperCase() !== 'NOASSERTION';
  }
  if (Array.isArray(v)) return v.length > 0;
  if (isRecord(v)) return Object.keys(v).length > 0;
  return true;
}

/**
 * Python's str(), for the handful of types that reach `equals`.
 *
 * str(None) is "None", not "null", and str(True) is "True", not "true". The
 * comparison is case-insensitive so the booleans rarely bite, but None does:
 * a key present with a null value must not silently compare equal to the
 * string "null".
 */
export function pyStr(v: Json): string {
  if (v === null || v === undefined) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  return String(v);
}
