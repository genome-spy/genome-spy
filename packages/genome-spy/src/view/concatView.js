import { getViewClass, isHConcatSpec, isVConcatSpec } from "./viewUtils";
import ContainerView from "./containerView";
import FlexLayout, {
    parseSizeDef,
    FlexDimensions
} from "../utils/layout/flexLayout";

/**
 * Creates a vertically or horizontally concatenated layout for children.
 *
 * @typedef {import("./view").default} View
 * @typedef { import("../utils/layout/flexLayout").SizeDef} SizeDef
 */
export default class ConcatView extends ContainerView {
    /**
     *
     * @param {import("./viewUtils").AnyConcatSpec} spec
     * @param {import("./viewUtils").ViewContext} context
     * @param {import("./containerView").default} parent
     * @param {string} name
     */
    constructor(spec, context, parent, name) {
        super(spec, context, parent, name);

        /** @type {import("../spec/view").GeometricDimension } */
        this.mainDimension = isHConcatSpec(spec) ? "width" : "height";
        /** @type {import("../spec/view").GeometricDimension } */
        this.secondaryDimension =
            this.mainDimension == "width" ? "height" : "width";

        const childSpecs = isHConcatSpec(spec)
            ? spec.hconcat
            : isVConcatSpec(spec)
            ? spec.vconcat
            : spec.concat;

        /** @type { View[] } */
        this.children = childSpecs.map((childSpec, i) => {
            const View = getViewClass(childSpec);
            return new View(childSpec, context, this, "concat" + i);
        });

        this.flexLayout = new FlexLayout(
            this,
            /** @param {View} view */ item => item.getSize()[this.mainDimension]
        );
    }

    getSize() {
        /** @type {SizeDef} */
        const mainSizeDef = (this.spec[this.mainDimension] &&
            parseSizeDef(this.spec[this.mainDimension])) || {
            px: this.flexLayout.getMinimumSize()
        };

        const secondarySizeDef = (this.spec[this.secondaryDimension] &&
            parseSizeDef(this.spec[this.secondaryDimension])) || { grow: 1 };

        return this.mainDimension == "height"
            ? new FlexDimensions(secondarySizeDef, mainSizeDef)
            : new FlexDimensions(mainSizeDef, secondarySizeDef);
    }

    /**
     *
     * @param {import("./view").default} view
     */
    getChildCoords(view) {
        // Should be overridden
        const flexCoords = this.flexLayout.getPixelCoords(
            view,
            this.getCoords()[this.mainDimension]
        );
        if (flexCoords) {
            return this.getCoords()
                .translate(
                    ...(this.mainDimension == "height"
                        ? [0, flexCoords.location]
                        : [flexCoords.location, 0])
                )
                .modify({ [this.mainDimension]: flexCoords.size });
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
