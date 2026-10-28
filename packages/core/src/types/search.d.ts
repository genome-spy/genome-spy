import { ViewHandle } from "./embedApi.js";
import { ScaleResolutionApi } from "./scaleResolutionApi.js";
import { Scalar } from "../spec/channel.js";

/** Status of loaded records, not a claim of complete lazy-source coverage. */
export interface SearchSource {
    view: ViewHandle;
    dataRevision: number | null;
    readiness: "ready" | "pending";
    scan: "unscanned" | "partial" | "complete" | "excluded";
    rowsExamined: number;
    coverage: "loaded";
}

/** A record-derived interval; lookup never navigates. Locus intervals are half-open. */
export interface DatumSearchTarget {
    kind: "locus" | "numeric";
    channel: "x" | "y";
    scale: ScaleResolutionApi;
    interval: [number, number];
    zoomable: boolean;
}

/** A detached matching record from one loaded publication. */
export interface DatumSearchMatch {
    view: ViewHandle;
    datum: Record<string, unknown>;
    fields: string[];
    facetId: Scalar[] | undefined;
    targets: DatumSearchTarget[];
    targetIssues: {
        channel: "x" | "y";
        reason: "unsupported-projection" | "invalid-position";
    }[];
}

/** Bounded matches; an early stop leaves subsequent sources unscanned. */
export interface DatumSearchResult {
    matches: DatumSearchMatch[];
    truncated: boolean;
    sources: SearchSource[];
}

export interface DatumSearchOptions {
    /** Global result bound, applied after matching and optional target filtering. */
    limit: number;
    /** A live unit or container subtree belonging to this embed. */
    view?: ViewHandle;
    /** Restrict matching to this declared field; skip other views. */
    field?: string;
    mode?: "exact" | "prefix";
    /** Require at least one zoomable record-derived target before applying limit. */
    target?: "zoomable";
}

/** Search metadata, suitable for building a consumer-owned typeahead index. */
export interface SearchableView {
    view: ViewHandle;
    title: string;
    description: string | undefined;
    fields: {
        field: string;
        description: string | undefined;
        examples: string[];
    }[];
    /** Fields encountered while collecting examples; this is not a complete schema. */
    dataFields: string[];
    source: SearchSource;
}

/** Independent matching of terms against encoding.search fields. No coordinate parsing. */
export interface DatumSearch {
    findDatums(query: string, options: DatumSearchOptions): DatumSearchResult;
    listSearchableViews(options?: {
        view?: ViewHandle;
        exampleLimit?: number;
    }): SearchableView[];
}
