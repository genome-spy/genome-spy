import type { ViewAddress } from "./embedApi.js";

/**
 * Optional inspection of the live hierarchy owned by one view API.
 *
 * Import this type and `createViewQuery()` from `@genome-spy/core/view-query`.
 * Create the query object with `createViewQuery(api.views)`.
 */
export interface ViewQueryApi {
    /** Returns detached metadata. Throws for a removed view or finalized embed. */
    describe: (address: ViewAddress) => ViewDescription;

    /** Queries the current data-space viewport, optionally intersected with an interval selection. */
    queryData: (
        address: ViewAddress,
        options: ViewSliceQueryOptions
    ) => Promise<ViewSliceQueryResult>;

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
    /** Current collector publication revision, or null without a collector. */
    dataRevision: number | null;

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

/** Exact operations reuse Core aggregate-transform numeric semantics. */
export interface ViewSliceAggregate {
    op: "count" | "valid" | "sum" | "min" | "max" | "mean" | "variance";
    /** Required except for count. Supports the same field paths as aggregate transforms. */
    field?: string;
    /** Unique result property. */
    as: string;
}

export interface ViewSliceQueryOptions {
    /** Numeric or locus viewport axes to intersect. No pixel visibility is implied. */
    channels: ("x" | "y")[];
    /** Named interval selection in this view's parameter scope. A wholly cleared selection matches no rows. */
    selection?: string;
    /** Returned fields. Omit to return whole detached rows. */
    fields?: string[];
    /** Maximum returned rows, 0–1000. Does not limit scanning or aggregation. */
    limit: number;
    /** Compute each operation over all matching loaded rows, even when rows are truncated. */
    aggregate?: ViewSliceAggregate[];
    signal?: AbortSignal;
}

export interface ViewSliceQueryResult {
    rows: Record<string, unknown>[];
    /** All loaded rows examined, before scope filtering. */
    rowsExamined: number;
    /** All loaded rows matching the scope. */
    rowsMatched: number;
    truncated: boolean;
    /** Detached aggregate-transform values. Undefined results (for example empty mean) are null. */
    aggregates: Record<string, unknown>;
    scope: {
        type: "viewport";
        /** Captured numeric domains; locus coordinates use Core's linearized genome. */
        domains: Partial<Record<"x" | "y", number[]>>;
        selection?: {
            name: string;
            value: import("./selectionTypes.js").IntervalSelection;
        };
        dataRevision: number;
        data: "loaded-transformed";
        /** Ready for the viewport does not prove full lazy-source coverage. */
        sourceCoverage: "unknown";
    };
}
