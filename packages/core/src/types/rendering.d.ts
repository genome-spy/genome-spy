import Mark from "../marks/mark.js";
import Rectangle from "../view/layout/rectangle.js";
import ViewRenderingContext from "../view/renderingContext/viewRenderingContext.js";

export interface RenderingOptions {
    /**
     * Which facet to render (if faceting is being used)
     */
    facetId?: any;

    /**
     * If rendering facets, this is the first facet. Allows for
     * cleanup, etc.
     */
    firstFacet?: boolean;

    sampleFacetOffset?: () => number;
    sampleFacetHeight?: () => number;

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
