import { ComplexDomain, NumericDomain } from "../spec/scale.js";
import ScaleResolution from "../scales/scaleResolution.js";

export type ScaleResolutionEventType = "domain" | "range";
export interface ScaleResolutionEvent {
    type: ScaleResolutionEventType;

    scaleResolution: ScaleResolution;
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
     * Returns the current, possible zoomed domain.
     */
    getDomain(): any[];

    /**
     * Returns true if the domain has been provided explicitly in the spec.
     */
    isDomainDefinedExplicitly(): boolean;

    /**
     * Returns true when the scale domain has moved beyond the placeholder startup state.
     */
    isDomainInitialized(): boolean;

    /**
     * Returns the current, possible zoomed domain converted into complex objects
     * such as genomic coordinates.
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
