import { getViewClass } from "./viewUtils";
import ContainerView from "./containerView";
import FlexLayout, { parseSizeDef } from "../utils/flexLayout";

/**
 * @typedef {import("./view").default} View
 * @typedef { import("../utils/flexLayout").SizeDef} SizeDef
 */
export default class VConcatView extends ContainerView {
    /**
     *
     * @param {import("./viewUtils").VConcatSpec} spec
     * @param {import("./viewUtils").ViewContext} context
     * @param {import("./containerView").default} parent
     * @param {string} name
     */
    constructor(spec, context, parent, name) {
        super(spec, context, parent, name);

        /** @type { View[] } */
        this.children = (spec.concat || []).map((childSpec, i) => {
            const View = getViewClass(childSpec);
            return new View(childSpec, context, this, "vconcat" + i);
        });

        this.flexLayout = new FlexLayout(this, item => item.getHeight());
    }

    getHeight() {
        const sizeDef = this.spec.height && parseSizeDef(this.spec.height);
        return sizeDef || { px: this.flexLayout.getMinimumSize() };
    }

    /**
     *
     * @param {import("./view").default} view
     * @returns {import("../utils/flexLayout").LocSize}
     */
    getChildCoords(view) {
        // Should be overridden
        const childCoords = this.flexLayout.getPixelCoords(
            view,
            this.getCoords().size
        );
        if (childCoords) {
            return {
                location: this.getCoords().location + childCoords.location,
                size: childCoords.size
            };
        }
        throw new Error("Unknown child!");
    }

    /**
     * @returns {IterableIterator<View>}
     */
    *[Symbol.iterator]() {
        for (const child of this.children) {
            yield child;
        }
    }

    /**
     * @param {string} channel
     */
    getDefaultResolution(channel) {
        return channel == "x" ? "shared" : "independent";
    }
}
