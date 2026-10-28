/** An ordered assembly dictionary, independent of any running visualization. */
export interface CoordinateAssembly {
    readonly contigs: readonly {
        readonly name: string;
        readonly size: number;
    }[];
}

/** A zero-based chromosome-relative endpoint. */
export interface CoordinateLocus {
    chrom: string;
    pos: number;
}

/** Zero-based half-open chromosome-relative interval. */
export type CoordinateInterval = readonly [CoordinateLocus, CoordinateLocus];

/** Syntax-only results have the same shape as assembly-validated results. */
export type CoordinateQueryResult =
    | { kind: "coordinate"; interval: CoordinateInterval }
    | { kind: "not-coordinate" }
    | {
          kind: "invalid-coordinate";
          code:
              | "syntax"
              | "unknown-contig"
              | "bounds"
              | "order"
              | "ambiguous-contig";
          message: string;
      };
