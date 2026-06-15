import Mark from "../marks/mark.js";
import { LocSize } from "../view/layout/flexLayout.js";
import Rectangle from "../view/layout/rectangle.js";
import ViewRenderingContext from "../view/renderingContext/viewRenderingContext.js";

/**
 * Describes the location of a sample facet. Left is the primary pos, right is for
 * transitioning between two sets of samples.
 */
export interface SampleFacetRenderingOptions {
    /**
     * Location and height. Use unit scale by default; when `pixelToUnit` is
     * provided, interpret values as pixels and scale them.
     */
    locSize: LocSize;

    /**
     * Multiply pixel-based locSize values to unit scale.
     */
    pixelToUnit: number;
}

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

    sampleFacetRenderingOptions?: SampleFacetRenderingOptions;

    /**
     * Convenience shorthand for clipping rendering to the given rectangle in
     * both directions. Core rendering internals normalize this to `clip`.
     *
     * Mainly intended for existing callers that need ordinary rectangular
     * clipping.
     */
    clipRect?: Rectangle;

    /**
     * Clip rendering using the given rectangle and direction flags. Prefer this
     * option when clipping should apply only horizontally or vertically.
     */
    clip?: ClipOptions;
}

export interface ClipOptions {
    rect: Rectangle;
    clipX: boolean;
    clipY: boolean;
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
    clip?: ClipOptions;
    cullClip?: ClipOptions;
}

/**
 * Method signature for View.render(). Reduces the amount of JSDoc needed.
 */
export type RenderMethod = (
    context: ViewRenderingContext,
    coords: Rectangle,
    options?: RenderingOptions
) => void;
