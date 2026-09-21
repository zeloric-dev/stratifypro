/**
 * The address this deployment believes it lives at.
 *
 * Hardcoded to https://stratifypro.io at first, which was wrong the moment it
 * shipped: the site went live at stratifypro.vercel.app while that domain had
 * no DNS records at all. The deployed robots.txt pointed a crawler at a sitemap
 * that did not exist, and the sitemap itself listed 448 URLs on a host that
 * answered nothing. A permanent URL that does not resolve is not a permanent
 * URL, which is the whole argument step 1.13 rests on.
 *
 * Derived in order of how much the environment knows:
 *
 *   NEXT_PUBLIC_SITE_URL          set it explicitly and nothing else is consulted
 *   VERCEL_PROJECT_PRODUCTION_URL Vercel's own answer, and it prefers the custom
 *                                 domain once one is attached and resolving, so
 *                                 this becomes stratifypro.io by itself
 *   VERCEL_URL                    the individual deployment, for previews
 *   localhost                     development
 *
 * The point of the order is that nobody has to remember to change a constant on
 * the day DNS starts working.
 */
function fromEnv(): string {
  const explicit = process.env['NEXT_PUBLIC_SITE_URL'];
  if (explicit) return explicit.replace(/\/+$/, '');

  const production = process.env['VERCEL_PROJECT_PRODUCTION_URL'];
  if (production) return `https://${production}`;

  const deployment = process.env['VERCEL_URL'];
  if (deployment) return `https://${deployment}`;

  return 'http://localhost:3000';
}

export const BASE = fromEnv();
