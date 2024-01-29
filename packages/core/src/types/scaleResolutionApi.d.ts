import { ComplexDomain, NumericDomain } from "../spec/scale.js";
import ScaleResolution from "../view/scaleResolution.js";

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
     * Returns the current, possible zoomed domain converted into complex objects
     * such as genomic coordinates.
     */
    getComplexDomain(): NumericDomain | ComplexDomain;

    isZoomable(): boolean;

    zoomTo(
        domain: number[] | ComplexDomain,
        duration?: boolean | number
    ): Promise<void>;
}
