import { SharedBudget } from "@gmod/shared-read-cache";

/** Shared retention ceiling for decompressed BAM and Tabix chunks. */
export const GMOD_CHUNK_CACHE_BUDGET_BYTES = 1024 * 1024 * 1024;

/**
 * BAM and Tabix weigh cache entries in decompressed bytes, so they can safely
 * share one global LRU budget instead of multiplying the per-file default.
 * Members are weakly held and individual sources clear their caches on
 * disposal. Reads in flight and each cache's last settled entry may exceed the
 * retention ceiling, as documented by @gmod/shared-read-cache.
 */
export const gmodChunkCacheBudget = new SharedBudget(
    GMOD_CHUNK_CACHE_BUDGET_BYTES
);
