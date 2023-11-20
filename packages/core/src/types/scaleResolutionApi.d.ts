import { ComplexDomain, NumericDomain } from "../spec/scale.js";
import ScaleResolution from "../view/scaleResolution.js";

export interface ScaleResolutionEvent {
    type: "domain";

    scaleResolution: ScaleResolution;
}

export type ScaleResolutionListener = (event: ScaleResolutionEvent) => void;

/**
 * A public API for ScaleResolution
 */
export interface ScaleResolutionApi {
    addEventListener(type: "domain", listener: ScaleResolutionListener): void;

    removeEventListener(
        type: "domain",
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
