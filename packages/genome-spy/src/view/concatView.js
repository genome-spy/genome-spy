import { isHConcatSpec, isVConcatSpec } from "./viewFactory";
import ContainerView from "./containerView";
import {
    mapToPixelCoords,
    getMinimumSize,
    parseSizeDef,
    FlexDimensions,
} from "../utils/layout/flexLayout";
import Rectangle from "../utils/layout/rectangle";
import Padding from "../utils/layout/padding";
import { peek } from "../utils/arrayUtils";

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

        this.spec = spec;

        if (!("spacing" in this.spec)) {
            this.spec.spacing = 10; // TODO: Provide a global configuration (theme!)
        }

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
        this.children = childSpecs.map((childSpec, i) =>
            context.createView(childSpec, this, "concat" + i)
        );
    }

    _getFlexSizeDefs() {
        return this._cache("size/flexSizeDefs", () =>
            this.children.map((view) => view.getSize()[this.mainDimension])
        );
    }

    _getEffectiveChildPaddings() {
        return this._cache("size/effectiveChildPaddings", () =>
            this.children
                .map((view) => view.getEffectivePadding())
                .map((padding) =>
                    this.mainDimension == "height"
                        ? [padding.left, padding.right]
                        : [padding.top, padding.bottom]
                )
        );
    }

    getEffectivePadding() {
        return this._cache("size/effectivePadding", () => {
            if (!this.children.length) {
                return this.getPadding();
            }

            // Max paddings along the secondary dimension
            const maxPaddings = getMaxEffectivePaddings(
                this._getEffectiveChildPaddings()
            );

            const effectiveChildPadding =
                this.mainDimension == "height"
                    ? new Padding(
                          this.children[0].getEffectivePadding().top,
                          maxPaddings[1],
                          peek(this.children).getEffectivePadding().bottom,
                          maxPaddings[0]
                      )
                    : new Padding(
                          maxPaddings[0],
                          this.children[0].getEffectivePadding().left,
                          maxPaddings[1],
                          peek(this.children).getEffectivePadding().right
                      );

            return this.getPadding().add(effectiveChildPadding);
        });
    }

    getSize() {
        return this._cache("size", () => {
            /** @type {SizeDef} */
            let mainSizeDef;
            if (this.spec[this.mainDimension]) {
                mainSizeDef = parseSizeDef(this.spec[this.mainDimension]);
            } else {
                const childMainSizeDefs = this._getFlexSizeDefs();
                mainSizeDef = {
                    // Grows are summed to support sensible nesting of concatViews
                    grow: childMainSizeDefs
                        .map((sizeDef) => +sizeDef.grow)
                        .reduce((a, b) => a + b, 0),
                    px: getMinimumSize(childMainSizeDefs, {
                        spacing: this.spec.spacing,
                    }),
                };
            }

            const secondarySizeDef = (this.spec[this.secondaryDimension] &&
                parseSizeDef(this.spec[this.secondaryDimension])) || {
                grow: 1,
            };

            return (
                this.mainDimension == "height"
                    ? new FlexDimensions(secondarySizeDef, mainSizeDef)
                    : new FlexDimensions(mainSizeDef, secondarySizeDef)
            ).addPadding(this.getPadding());
        });
    }

    /**
     * @param {import("./renderingContext/viewRenderingContext").default} context
     * @param {import("../utils/layout/rectangle").default} coords
     * @param {import("./view").RenderingOptions} [options]
     */
    render(context, coords, options = {}) {
        coords = coords.shrink(this.getPadding());
        context.pushView(this, coords);

        // This method produces piles of garbage when used with sample faceting.
        // TODO: Figure out something. Perhaps the rectangles could be cached because
        // they are identical for each sample facet.

        const mappedCoords = mapToPixelCoords(
            this._getFlexSizeDefs(),
            coords[this.mainDimension],
            {
                spacing: this.spec.spacing,
                devicePixelRatio: this.context.glHelper.dpr,
            }
        );

        // Align the views.
        const paddings = this._getEffectiveChildPaddings();
        const maxPaddings = getMaxEffectivePaddings(paddings);

        for (let i = 0; i < this.children.length; i++) {
            const flexCoords = mappedCoords[i];
            const view = this.children[i];

            const pa = maxPaddings[0] - paddings[i][0];
            const pb = maxPaddings[1] - paddings[i][1];

            const secondarySize = coords[this.secondaryDimension] - pa - pb;

            const childCoords =
                this.mainDimension == "height"
                    ? new Rectangle(
                          () => coords.x + pa,
                          () => coords.y + flexCoords.location,
                          () => secondarySize,
                          () => flexCoords.size
                      )
                    : new Rectangle(
                          () => coords.x + flexCoords.location,
                          () => coords.y + pa,
                          () => flexCoords.size,
                          () => secondarySize
                      );

            view.render(context, childCoords, options);
        }

        context.popView(this);
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
     * Adds a child using a spec. Does NOT perform any initializations.
     * Returns the newly added view instance.
     *
     * @param {import("./viewUtils").ViewSpec} viewSpec
     */
    addChildBySpec(viewSpec) {
        // TODO: Move to containerView

        // TODO: More robust solution. Will break in future when views can be removed
        const i = this.children.length;

        const view = this.context.createView(viewSpec, this, "concat" + i);
        this.children.push(view);

        return view;
    }

    /**
     * Adds a child. Does NOT perform any initializations.
     * Returns the newly added view instance.
     *
     * @param {View} view
     */
    addChild(view) {
        // TODO: Move to containerView

        // TODO: More robust solution. Will break in future when views can be removed
        const i = this.children.length;

        if (!view.name) {
            view.name = "concat" + i;
        }
        view.parent = this;
        this.children.push(view);

        return view;
    }

    /**
     * @param {string} channel
     * @param {import("./containerView").ResolutionTarget} resolutionType
     * @returns {import("../spec/view").ResolutionBehavior}
     */
    getDefaultResolution(channel, resolutionType) {
        // TODO: Default to shared when working with genomic coordinates
        return "independent";
    }
}

/**
 *
 * @param {number[][]} paddings
 */
function getMaxEffectivePaddings(paddings) {
    return [0, 1].map((i) =>
        paddings.map((p) => p[i]).reduce((a, c) => Math.max(a, c), 0)
    );
}
