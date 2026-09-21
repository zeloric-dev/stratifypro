/**
 * @stratifypro/mirror
 *
 * Depends on engine types only, never the reverse. The engine must stay fully
 * usable with this package absent, because the free browser checker ships the
 * engine and the rule packs alone.
 */
export const PACKAGE_NAME = '@stratifypro/mirror' as const;
