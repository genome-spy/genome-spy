import { ComplexDomain, NumericDomain } from "../spec/scale.js";
import ScaleResolution from "../scales/scaleResolution.js";

export type ScaleResolutionEventType = "domain" | "range";
export interface ScaleResolutionEvent {
    type: ScaleResolutionEventType;

    scaleResolution: ScaleResolution;
}

export type ScaleResolutionListener = (event: ScaleResolutionEvent) => void;

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
        duration?: boolean | number
    ): Promise<void>;
}
