import Mark from "../marks/mark.js";
import { LocSize } from "../utils/layout/flexLayout.js";
import Rectangle from "../utils/layout/rectangle.js";

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

/**
 * Allows for collecting marks for optimized rendering order.
 */

export interface BufferedRenderingRequest {
    mark: Mark;
    callback: () => void;
    coords: Rectangle;
    clipRect?: Rectangle;
}

/**
 * Method signature for View.render(). Reduces the amount of JSDoc needed.
 */
export type RenderMethod = (
    context: ViewRenderingContext,
    coords: Rectangle,
    options?: RenderingOptions
) => void;
