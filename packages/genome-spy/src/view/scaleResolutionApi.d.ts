import ScaleResolution from "./scaleResolution";

export interface ScaleResolutionEvent {
    type: "domain";

    scaleResolution: ScaleResolution;
}

export type ScaleResolutionListener = (event: ScaleResolutionEvent) => void;

/**
 * A public API for ScaleResolution
 */
export interface ScaleResolutionApi {
    addEventListener: (
        type: "domain",
        listener: ScaleResolutionListener
    ) => void;
    removeEventListener: (
        type: "domain",
        listener: ScaleResolutionListener
    ) => void;
}
