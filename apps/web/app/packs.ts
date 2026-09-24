/**
 * The rule packs, as the browser sees them.
 *
 * One place, because /rules/<id> and anything else that lists rules must agree
 * on which packs exist. The CLI enumerates packs/ from disk; a static site
 * cannot, so each pack is imported by name.
 *
 * That leaves a hand-written list, here and in check.worker.ts and
 * FileChecker.tsx. scripts/check-pack-lists.py asserts all three match the
 * directory, so adding a third pack fails the build instead of silently
 * omitting every rule in it from /rules and from generateStaticParams.
 *
 * This comment used to claim that test existed before it did.
 */
import { loadRulePack, type Rule, type RulePack } from '@stratifypro/engine';
import cisa from '@stratifypro/rules/packs/cisa-2026-v2.1.json';
import fda from '@stratifypro/rules/packs/fda-524b.json';
import g7 from '@stratifypro/rules/packs/g7-ai-2026.json';

export const PACKS: RulePack[] = [
  loadRulePack(fda as never),
  loadRulePack(cisa as never),
  loadRulePack(g7 as never),
];

export interface Located {
  rule: Rule;
  pack: RulePack;
}

/** Every rule across every pack, in pack order then pack-declared order. */
export function allRules(): Located[] {
  return PACKS.flatMap((pack) => pack.rules.map((rule) => ({ rule, pack })));
}

/**
 * A rule id is unique across packs, which packages/rules/src/validate.py
 * enforces within a pack and check-claims.py enforces across both. That is what
 * lets /rules/<id> take an id with no pack qualifier.
 */
export function findRule(id: string): Located | undefined {
  return allRules().find((r) => r.rule.id === id);
}
