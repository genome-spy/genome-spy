import { peek } from "../../utils/arrayUtils";
import ViewRenderingContext from "./viewRenderingContext";

/**
 * A trivial proof-of-concept SVG rendering context. Doesn't render any
 * marks at this point, only placeholders.
 *
 * @typedef {import("../view").default} View
 */
export default class SvgViewRenderingContext extends ViewRenderingContext {
    /**
     *
     * @param {import("../rendering").GlobalRenderingOptions} globalOptions
     */
    constructor(globalOptions) {
        super(globalOptions);

        /** @type {import("../../utils/layout/rectangle").default} */
        this.coords = undefined;

        this.svg = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "svg"
        );

        /** @type {SVGElement[]} */
        this.nodeStack = [this.svg];
    }

    /**
     * Must be called when a view's render() method is entered
     *
     * @param {View} view
     * @param {import("../../utils/layout/rectangle").default} coords View coordinates
     *      inside the padding.
     */
    pushView(view, coords) {
        view.onBeforeRender();
        this.coords = coords;

        if (this._currentNode === this.svg) {
            const viewBox = coords.expand(view.getPadding());
            this.svg.setAttributeNS(
                null,
                "viewBox",
                [viewBox.x, viewBox.y, viewBox.width, viewBox.height].join(" ")
            );
        }

        const group = createNode("g");
        const title = createNode("title");
        title.textContent = view.name;
        group.appendChild(title);

        this._currentNode.appendChild(group);
        this.nodeStack.push(group);
    }

    /**
     * Must be called when a view's render() method is being exited
     *
     * @param {View} view
     */
    popView(view) {
        this.nodeStack.pop();
    }

    /**
     *
     * @param {import("../../marks/mark").default} mark
     * @param {import("../view").RenderingOptions} options
     */
    renderMark(mark, options) {
        const current = this._currentNode;

        const rect = createNode("rect", {
            x: this.coords.x,
            y: this.coords.y,
            width: this.coords.width,
            height: this.coords.height,
            fill: "transparent",
            stroke: "black",
            "stroke-width": 1,
        });

        const name = createNode("text", {
            x: this.coords.x + this.coords.width / 2,
            y: this.coords.y + this.coords.height / 2,
            "dominant-baseline": "middle",
            "text-anchor": "middle",
        });

        name.textContent = mark.getType();

        current.appendChild(rect);
        current.appendChild(name);
    }

    getSvg() {
        return this.svg;
    }

    get _currentNode() {
        return peek(this.nodeStack);
    }
}

/**
 * Adapted from: https://stackoverflow.com/a/37411738/1547896
 *
 * @param {string} name
 * @param {Record<string, any>} [attributes]
 */
function createNode(name, attributes) {
    const element = document.createElementNS(
        "http://www.w3.org/2000/svg",
        name
    );
    if (attributes) {
        for (const [k, v] of Object.entries(attributes)) {
            element.setAttributeNS(null, k, v);
        }
    }
    return element;
}
