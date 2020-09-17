import { getViewClass } from "./viewUtils";
import ContainerView from "./containerView";
import FlexLayout, { parseSizeDef } from "../utils/flexLayout";

/**
 *
 * @typedef {import("./view").default} View
 * @typedef { import("../utils/flexLayout").SizeDef} SizingSpec
 */
export default class VConcatView extends ContainerView {
    /**
     *
     * @param {import("./viewUtils").VConcatSpec} spec
     * @param {import("./viewUtils").ViewContext} context
     * @param {View} parent
     * @param {string} name
     */
    constructor(spec, context, parent, name) {
        super(spec, context, parent, name);

        /** @type { View[] } */
        this.children = (spec.concat || []).map((childSpec, i) => {
            const View = getViewClass(childSpec);
            return new View(childSpec, context, this, "vconcat" + i);
        });

        this.flexLayout = new FlexLayout(
            this,
            item => item.getSize(),
            () => this.getHeight()
        );
    }

    getHeight() {
        return (
            this._height ||
            (this.spec.height && parseSizeDef(this.spec.height)) ||
            parseSizeDef(1)
        );
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
