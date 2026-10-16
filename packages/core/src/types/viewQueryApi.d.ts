import type { ViewAddress } from "./embedApi.js";

/**
 * Optional inspection of the live hierarchy owned by one view API.
 *
 * Import this type and `createViewQuery()` from `@genome-spy/core/view-query`.
 * Create the query object with `createViewQuery(api.views)`.
 */
export interface ViewQueryApi {
    /** Describes loaded source coverage without fetching data or changing the viewport. */
    describeSource: (address: ViewAddress) => ViewSourceDescription | null;

    /** Reads retained source rows before transforms; never loads additional data. */
    readSourceData: (
        address: ViewAddress,
        options: ViewSourceDataReadOptions
    ) => ViewSourceDataReadResult;

    /** Returns detached metadata. Throws for a removed view or finalized embed. */
    describe: (address: ViewAddress) => ViewDescription;

    /** Assesses the requested scope without scanning rows. Execution rechecks it. */
    assessQuery: (
        address: ViewAddress,
        options: ViewQueryScopeOptions
    ) => ViewQueryAssessment;

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
    /** Visibility/opacity state, not proof that a row produced visible pixels. */
    visibility: {
        /** Host-configured visibility of this view. */
        configured: boolean;
        /** Whether this view and all its layout ancestors are configured visible. */
        ancestorsVisible: boolean;
        /** Null when opacity cannot yet be evaluated to a finite value. */
        opacity: number | null;
    };
    /** Nearest authored primary source, or null when none exists. */
    source: ViewSourceDescription | null;

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

export interface ViewQueryScopeOptions {
    /** Numeric or locus viewport axes to intersect. No pixel visibility is implied. */
    channels: ("x" | "y")[];
    /** Named interval selection in this view's parameter scope. A wholly cleared selection matches no rows. */
    selection?: string;
}

export type QuerySupportReason =
    | "data-not-ready"
    | "non-unit"
    | "multiple-facets"
    | "unsupported-scale"
    | "unsupported-position"
    | "unsupported-selection";

/** A snapshot of scope support, not a guarantee of later execution or row cloneability. */
export type ViewQueryAssessment =
    | { status: "ready" }
    | { status: "pending"; reason: "data-not-ready" }
    | {
          status: "unsupported";
          reason: Exclude<QuerySupportReason, "data-not-ready">;
      };

export interface ViewSliceQueryOptions extends ViewQueryScopeOptions {
    /** Returned fields. Omit for whole rows. */
    fields?: string[];
    /** Maximum returned rows (nonnegative safe integer), or null for all matching rows. Does not limit scanning. */
    limit: number | null;
    signal?: AbortSignal;
}

export interface ViewSliceQueryResult {
    rows: Record<string, unknown>[];
    /** All loaded rows examined, before scope filtering. */
    rowsExamined: number;
    /** All loaded rows matching the scope, before limiting returned rows. */
    rowsMatched: number;
    truncated: boolean;
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
        primarySource: ViewSourceDescription | null;
    };
}

/** Explicit bound, or null for every retained loaded source row. */
export interface ViewSourceDataReadOptions {
    limit: number | null;
}

/** Detached rows before view transforms, not necessarily the whole backing source. */
export interface ViewSourceDataReadResult {
    rows: Record<string, unknown>[];
    rowsExamined: number;
    truncated: boolean;
    dataRevision: number;
    scope: "loaded-source";
    source: ViewSourceDescription | null;
}

/** Current primary source state, before any view transforms. */
export interface ViewSourceDescription {
    retentionEnabled: boolean;
    /** Retained collector revision, or null when retention is disabled/uninitialized. */
    dataRevision: number | null;
    /** Whether the source meets its current viewport readiness policy. */
    ready: boolean;
    /** Null when this source has no registered loading status. Readiness is separate. */
    loadingStatus: "loading" | "complete" | "error" | null;
    coverage:
        | { type: "complete-source" }
        | {
              type: "published-domain";
              channel: "x" | "y";
              /** Linearized bounds of the last publication, not raw-record completeness. */
              domain: number[];
          }
        | { type: "unknown" };
}
