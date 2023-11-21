import { peek } from "../../utils/arrayUtils.js";
import ViewRenderingContext from "./viewRenderingContext.js";

/**
 * A Rendering context that doesn't render anything. It creates a hierarchy
 * of view coordinates, including faceted views that are repeated multiple times.
 * The coordinates can be used for debugging or testing of the layout engine.
 *
 * @typedef {import("../view.js").default} View
 * @typedef {import("../layout/rectangle.js").default} Rectangle
 *
 */
export default class DebugginViewRenderingContext extends ViewRenderingContext {
    /**
     * @param {import("../../types/rendering.js").GlobalRenderingOptions} globalOptions
     */
    constructor(globalOptions) {
        super(globalOptions);

        /** @type {ViewCoords} */
        this.root = undefined;

        /** @type {ViewCoords[]} */
        this.stack = [];
    }

    /**
     * Must be called when a view's render() method is entered
     *
     * @param {View} view
     * @param {Rectangle} coords View coordinates
     *      inside the padding.
     */
    pushView(view, coords) {
        // TODO: Facet id

        const viewCoords = new ViewCoords(view.name, coords);

        if (!this.root) {
            this.root = viewCoords;
        } else {
            peek(this.stack).addChild(viewCoords);
        }
        this.stack.push(viewCoords);
    }

    /**
     * Must be called when a view's render() method is being exited
     *
     * @param {View} view
     */
    popView(view) {
        this.stack.pop();
    }

    getLayout() {
        return this.root;
    }
}

/**
 * Represents coordinates of view instances. Faceted views objects may have
 * been rendered at multiple locations.
 */
class ViewCoords {
    /**
     * @param {string} viewName
     * @param {Rectangle} coords
     */
    constructor(viewName, coords) {
        this.viewName = viewName;
        this.coords = coords.toRoundedString();
        /** @type {ViewCoords[]} */
        this.children = [];
    }

    /**
     *
     * @param {ViewCoords} viewCoords
     */
    addChild(viewCoords) {
        const last = peek(this.children);
        if (
            last &&
            viewCoords.viewName == last.viewName &&
            viewCoords.coords == last.coords
        ) {
            // Skip extra copies of sample facets. They all have the same coords.
            return;
        }

        this.children.push(viewCoords);
    }
}
