import type { ViewAddress } from "./embedApi.js";

/** Optional inspection of the live hierarchy owned by one view API. */
export interface ViewQueryApi {
    /** Returns detached metadata. Throws for a removed view or finalized embed. */
    describe: (address: ViewAddress) => ViewDescription;

    /**
     * Returns a bounded detached read from one ready unit view with at most one facet batch.
     * Throws for unready data, containers, removed views, finalized embeds,
     * multiple facet batches, non-cloneable returned values, or shared memory.
     * The row bound does not bound the size of an individual nested datum.
     */
    readData: (
        address: ViewAddress,
        options: ViewDataReadOptions
    ) => ViewDataReadResult;
}

export interface ViewDescription {
    /** View title text, or null when absent. */
    title: string | string[] | null;

    /** Authored view description, or null when absent. */
    description: string | string[] | null;

    /** Authored encoding combined with inherited encoding, detached from the specification. */
    encoding: import("../spec/channel.js").Encoding;

    /**
     * Unit-view data readiness for the current viewport; false for containers.
     * Does not imply a rendered frame.
     */
    dataReady: boolean;
}

export interface ViewDataReadOptions {
    /** Maximum returned rows, from 0 to 1000. Examines at most limit + 1 rows. */
    limit: number;
}

export interface ViewDataReadResult {
    /** Detached values in collector order, excluding Core picking identifiers. */
    rows: Record<string, unknown>[];

    /** Number of visited rows, including at most one lookahead row. */
    rowsExamined: number;

    /** More currently loaded transformed rows exist beyond the returned rows. */
    truncated: boolean;

    /** Loaded transformed rows, not viewport-filtered marks or all source rows. */
    scope: "loaded-transformed";
}
