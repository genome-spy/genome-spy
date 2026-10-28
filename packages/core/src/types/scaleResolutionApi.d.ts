import { ComplexDomain, NumericDomain } from "../spec/scale.js";

export type ScaleResolutionEventType = "domain" | "range";
export interface ScaleResolutionEvent {
    type: ScaleResolutionEventType;

    scaleResolution: ScaleResolutionApi;
}

export type ScaleResolutionListener = (event: ScaleResolutionEvent) => void;

export interface ZoomToOptions {
    /**
     * Approximate transition duration. Zero or omitted zooms immediately.
     * Boolean `true` indicates a default duration.
     */
    duration?: boolean | number;

    /**
     * Render immediately without scheduling an animation frame.
     *
     * This is intended for synchronizing multiple GenomeSpy instances, where
     * the target view should be redrawn during the same animation frame as the
     * source view. Use it only for zero-duration zooms. It is not supported for
     * animated transitions and may do redundant work if several domains are
     * applied before the browser has a chance to paint.
     */
    renderImmediately?: boolean;
}

/**
 * A public API for ScaleResolution
 */
export interface ScaleResolutionApi {
    addEventListener(
        type: ScaleResolutionEventType,
        listener: ScaleResolutionListener
    ): void;

    removeEventListener(
        type: ScaleResolutionEventType,
        listener: ScaleResolutionListener
    ): void;

    /**
     * Returns the current, possibly zoomed domain. For locus scales, this is
     * the internal half-open numeric interval; zoomTo() currently expects an
     * inclusive upper endpoint.
     */
    getDomain(): any[];

    /**
     * Returns true if the domain has been provided explicitly in the spec.
     */
    isDomainDefinedExplicitly(): boolean;

    /**
     * Returns true when the scale domain has moved beyond the placeholder startup state.
     * @deprecated This legacy heuristic does not indicate data readiness.
     * Inspect getDomain() for the usability conditions required by your consumer.
     */
    isDomainInitialized(): boolean;

    /** Returns detached ordered contigs from an initialized locus scale. Throws for non-locus scales. */
    getAssembly(): import("./coordinates.js").CoordinateAssembly;

    /**
     * Returns the current domain converted into complex objects. Locus endpoints
     * are zero-based and inclusive, covering the integer bases in the viewport.
     */
    getComplexDomain(): NumericDomain | ComplexDomain;

    getLinkedSelectionDomainInfo():
        | {
              param: string;
              encoding: "x" | "y";
              persist: boolean;
          }
        | undefined;

    isZoomed(): boolean;

    isZoomable(): boolean;

    /**
     * Zooms to the given interval, optionally animating the transition.
     *
     * For locus scales, explicit numeric and chromosome-relative endpoints are
     * zero-based with an inclusive upper endpoint. Subtract one from the upper
     * position of half-open intervals returned by parseCoordinates() or datum
     * search before navigation. Whole-chromosome shortcuts retain their full extent.
     *
     * This legacy locus convention is retained for compatibility. Standardizing
     * genomic interval APIs on half-open endpoints is tracked for v2.0 in
     * {@link https://github.com/genome-spy/genome-spy/issues/620 | #620}.
     */
    zoomTo(
        domain: number[] | ComplexDomain,
        options?: ZoomToOptions
    ): Promise<void>;

    /**
     * @deprecated Use the options object form: `zoomTo(domain, { duration })`.
     */
    zoomTo(
        domain: number[] | ComplexDomain,
        duration: boolean | number
    ): Promise<void>;
}
