import type { ViewAddress } from "./embedApi.js";

/**
 * Optional inspection of the live hierarchy owned by one view API.
 *
 * Import this type and `createViewQuery()` from `@genome-spy/core/view-query`.
 * Create the query object with `createViewQuery(api.views)`.
 */
export interface ViewQueryApi {
    assessAnnotations: (address: ViewAddress) => ViewAnnotationAssessment;
    annotations: ViewAnnotations;
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

/** Restricted analysis over explicitly disclosed fields in a scoped query. */
export type ViewSliceAnalysisStage =
    | {
          type: "filter";
          field: string;
          op: "gt" | "gte" | "lt" | "lte" | "eq" | "neq";
          value: number;
          absolute?: boolean;
      }
    | {
          type: "aggregate";
          groupby?: string[];
          fields: (string | null)[];
          ops: ViewSliceAggregate["op"][];
          as: string[];
      }
    | {
          type: "window";
          groupby?: string[];
          sort?: {
              field: string | string[];
              order?:
                  "ascending" | "descending" | ("ascending" | "descending")[];
          };
          ops: ("row_number" | "count")[];
          fields?: null[];
          as: string[];
          frame: [null, null];
      };

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
    /** Returned fields, or required input columns for analysis. Omit for whole raw rows. */
    fields?: string[];
    /** Maximum returned rows (nonnegative safe integer), or null for all output rows. Does not limit scanning or aggregation. */
    limit: number | null;
    /** Compute each operation over all matching loaded rows, even when rows are truncated. */
    aggregate?: ViewSliceAggregate[];
    /** Transform all scoped rows before limiting. Requires fields; excludes aggregate. */
    analysis?: ViewSliceAnalysisStage[];
    /** Return temporary opaque references for row-preserving point queries. */
    includeAnnotationTargets?: boolean;
    signal?: AbortSignal;
}

export interface ViewSliceQueryResult {
    /** References aligned with rows; valid until the next target-producing query. */
    annotationTargets?: string[];
    rows: Record<string, unknown>[];
    /** All loaded rows examined, before scope filtering. */
    rowsExamined: number;
    /** All loaded rows matching the scope. */
    rowsMatched: number;
    /** Analysis output population before limit; present only for analysis requests. */
    outputRows?: number;
    truncated: boolean;
    /** Detached aggregate-transform values. Undefined results (for example empty mean) are null. */
    aggregates: Record<string, unknown>;
    scope: {
        type: "viewport";
        /** Detached analysis pipeline, in execution order. */
        analysis?: ViewSliceAnalysisStage[];
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

export type ViewAnnotationAssessment =
    | { status: "ready" }
    | {
          status: "pending" | "unsupported";
          reason: string;
      };

export interface ViewAnnotationSet {
    targets: { reference: string; text?: string }[];
    emphasis?: "purple" | "orange" | "blue";
    connectors?: boolean;
}

export interface ViewAnnotationState {
    activeTargets: number;
    sourceRevision: number | null;
    invalidated: boolean;
}

export interface ViewAnnotations {
    replace: (
        set: ViewAnnotationSet,
        options?: { signal?: AbortSignal }
    ) => Promise<void>;
    clear: () => Promise<void>;
    inspect: () => ViewAnnotationState;
    dispose: () => void;
}
