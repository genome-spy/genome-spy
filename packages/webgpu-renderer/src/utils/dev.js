/**
 * Shared development flag for gating internal invariants in dev builds.
 */
const metaEnv =
    /** @type {{ env?: { DEV?: boolean } }} */ (import.meta).env ?? {};
export const __DEV__ = metaEnv.DEV ?? false;
