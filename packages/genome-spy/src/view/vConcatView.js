import { getViewClass } from "./viewUtils";
import ContainerView from "./containerView";
import FlexLayout, {
    parseSizeDef,
    FlexDimensions
} from "../utils/layout/flexLayout";
import Rectangle from "../utils/layout/rectangle";

/**
 * @typedef {import("./view").default} View
 * @typedef { import("../utils/layout/flexLayout").SizeDef} SizeDef
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

        this.mainAxis = spec.hconcat ? "x" : "y";

        /** @type { View[] } */
        this.children = (spec.concat || []).map((childSpec, i) => {
            const View = getViewClass(childSpec);
            return new View(childSpec, context, this, "vconcat" + i);
        });

        this.flexLayout = new FlexLayout(
            this,
            /** @param {View} view */ item => item.getSize().height
        );
    }

    getSize() {
        const height = this.spec.height && parseSizeDef(this.spec.height);
        const width = this.spec.width && parseSizeDef(this.spec.width);

        return new FlexDimensions(
            { grow: 1 },
            height || { px: this.flexLayout.getMinimumSize() }
        );
    }

    /**
     *
     * @param {import("./view").default} view
     * @returns {Rectangle}
     */
    getChildCoords(view) {
        // Should be overridden
        const flexCoords = this.flexLayout.getPixelCoords(
            view,
            this.getCoords().height
        );
        if (flexCoords) {
            return this.getCoords()
                .translate(0, flexCoords.location)
                .modify({ height: flexCoords.size });
        }
        throw new Error("Not my child view!");
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
     * @param {import("./view").default} child
     * @param {import("./view").default} replacement
     */
    replaceChild(child, replacement) {
        const i = this.children.indexOf(child);
        if (i >= 0) {
            this.children[i] = replacement;
        } else {
            throw new Error("Not my child view!");
        }
    }

    /**
     * @param {string} channel
     */
    getDefaultResolution(channel) {
        // TODO: Default to shared only when working with genomic coordinates
        return channel == "x" ? "shared" : "independent";
    }
}