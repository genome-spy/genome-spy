import { LocSize } from "../utils/layout/flexLayout";
import Rectangle from "../utils/layout/rectangle";

/**
 * Describes the location of a sample facet. Left is the primary pos, right is for
 * transitioning between two sets of samples.
 */
export interface SampleFacetRenderingOptions {
    /**
     * Location and height on unit scale
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
