import { LocSize } from "../utils/layout/flexLayout";
import Rectangle from "../utils/layout/rectangle";

/**
 * Describes the location of a sample facet. Left is the primary pos, right is for
 * transitioning between two sets of samples.
 */
export interface SampleFacetRenderingOptions {
    /**
     * Location and height on unit scale, zero at top
     */
    locSize: LocSize;

    /**
     * Target (during transition)
     */
    targetLocSize?: LocSize;
}

export interface RenderingOptions {
    /**
     * Which facet to render (if faceting is being used)
     */
    facetId?: any;

    sampleFacetRenderingOptions?: SampleFacetRenderingOptions;

    /**
     * Clip rendering using the given rectangle.
     * Mainly intended for clipping scrollable views.
     */
    clipRect?: Rectangle;
}

/**
 * Options that affect the whole rendering pass.
 */
export interface GlobalRenderingOptions {
    /**
     * Replace colors with unique ids for picking.
     * Views that haven't enabled picking can be skipped.
     */
    picking?: boolean;
}
