import { peek } from "../../utils/arrayUtils";
import ViewRenderingContext from "./viewRenderingContext";

/**
 * A Rendering context that doesn't render anything. It creates a hierarchy
 * of view coordinates, including faceted views that are repeated multiple times.
 * The coordinates can be used for mouse events / interactions, for example.
 *
 * @typedef {import("../view").default} View
 * @typedef {import("../../utils/layout/rectangle").default} Rectangle
 *
 */
export default class LayoutRecorderViewRenderingContext extends ViewRenderingContext {
    constructor() {
        super();

        /** @type {ViewCoords} */
        this.root = undefined;

        /** @type {ViewCoords[]} */
        this.stack = [];

        /** @type {ViewCoords} */
        this.lastAddition = undefined;
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

        const viewCoords = new ViewCoords(view, coords);

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

class ViewCoords {
    /**
     * @param {View} view
     * @param {Rectangle} coords
     */
    constructor(view, coords) {
        this.view = view;
        this.coords = coords;
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
            viewCoords.view === last.view &&
            viewCoords.coords.equals(last.coords)
        ) {
            // Skip extra copies of sample facets. They all have the same coords.
            return;
        }

        this.children.push(viewCoords);
    }

    /**
     * Broadcasts a message to views that include the given (x, y) point.
     * This is mainly intended for mouse events.
     *
     * @param {number} x
     * @param {number} y
     * @param {import("../view").BroadcastMessage} message
     */
    broadcastMouseEvent(x, y, message) {
        if (this.coords.containsPoint(x, y)) {
            this.view.handleMouseEvent(this.coords, message);
        }

        for (const child of this.children) {
            child.broadcastMouseEvent(x, y, message);
        }
    }
}
