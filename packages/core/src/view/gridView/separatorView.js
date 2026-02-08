import UnitView from "../unitView.js";
import { markViewAsNonAddressable } from "../viewSelectors.js";

/**
 * @typedef {"horizontal" | "vertical"} SeparatorDirection
 */

const DEFAULT_SEPARATOR_PROPS = Object.freeze({
    size: 1,
    color: "#ccc",
    opacity: 1,
    strokeDash: [4, 4],
    strokeCap: "butt",
});

/**
 * Draws separator rules for a single direction in a grid layout.
 */
export default class SeparatorView {
    /** @type {SeparatorDirection} */
    #direction;

    /** @type {boolean} */
    #includePlotMargin;

    /** @type {UnitView} */
    #view;

    /** @type {import("../../data/flowNode.js").Datum[]} */
    #data = [];

    /** @type {number[]} */
    #positions = [];

    /** @type {{ x: number[]; y: number[] }} */
    #domains = {
        x: [0, 0],
        y: [0, 0],
    };

    /**
     * @param {{
     *   direction: SeparatorDirection,
     *   props: import("../../spec/view.js").SeparatorProps,
     *   context: import("../../types/viewContext.js").default,
     *   layoutParent: import("../containerView.js").default,
     *   dataParent: import("../view.js").default,
     *   getName: (prefix: string) => string
     * }} options
     */
    constructor({
        direction,
        props,
        context,
        layoutParent,
        dataParent,
        getName,
    }) {
        this.#direction = direction;
        this.#includePlotMargin = props.includePlotMargin ?? true;
        const markProps = { ...props };
        delete markProps.includePlotMargin;
        this.#view = this.#createView(
            markProps,
            context,
            layoutParent,
            dataParent,
            getName
        );
    }

    /**
     * @returns {UnitView}
     */
    get view() {
        return this.#view;
    }

    /**
     * @param {import("../layout/flexLayout.js").LocSize[]} flexCoords
     * @param {number} count
     * @param {import("../layout/rectangle.js").default} coords
     * @param {(direction: "row" | "column", index: number) => number} getViewSlot
     * @param {boolean} wrappingFacet
     * @param {import("../layout/padding.js").default} overhang
     */
    update(flexCoords, count, coords, getViewSlot, wrappingFacet, overhang) {
        this.#collectPositions(flexCoords, count, getViewSlot, wrappingFacet);
        this.#updateDirection(coords, overhang);
    }

    /**
     * @param {import("../renderingContext/viewRenderingContext.js").default} context
     * @param {import("../layout/rectangle.js").default} coords
     * @param {import("../../types/rendering.js").RenderingOptions} options
     */
    render(context, coords, options) {
        this.#view.render(context, coords, options);
    }

    /**
     * @param {import("../layout/flexLayout.js").LocSize[]} flexCoords
     * @param {number} count
     * @param {(direction: "row" | "column", index: number) => number} getViewSlot
     * @param {boolean} wrappingFacet
     */
    #collectPositions(flexCoords, count, getViewSlot, wrappingFacet) {
        this.#positions.length = 0;

        if (count < 2) {
            return;
        }

        const axis = this.#direction === "vertical" ? "column" : "row";
        const spacingOffset = wrappingFacet ? 3 : 2;

        for (let index = 1; index < count; index++) {
            const viewSlot = getViewSlot(axis, index);
            const spacingSlot = viewSlot - spacingOffset;
            const spacing = flexCoords[spacingSlot];
            const location = spacing ? spacing.location : 0;
            const size = spacing ? spacing.size : 0;
            this.#positions.push(location + size / 2);
        }
    }

    /**
     * @param {import("../layout/rectangle.js").default} coords
     * @param {import("../layout/padding.js").default} overhang
     */
    #updateDirection(coords, overhang) {
        const xStart = this.#includePlotMargin ? 0 : overhang.left;
        const xEnd = this.#includePlotMargin
            ? coords.width
            : coords.width - overhang.right;
        const yStart = this.#includePlotMargin ? 0 : overhang.bottom;
        const yEnd = this.#includePlotMargin
            ? coords.height
            : coords.height - overhang.top;

        this.#data.length = this.#positions.length;

        for (let i = 0; i < this.#positions.length; i++) {
            const pos = this.#positions[i];
            const entry = this.#data[i] ?? {};

            if (this.#direction === "vertical") {
                entry.x = pos;
                entry.x2 = pos;
                entry.y = yStart;
                entry.y2 = yEnd;
            } else {
                const y = coords.height - pos;
                entry.x = xStart;
                entry.x2 = xEnd;
                entry.y = y;
                entry.y2 = y;
            }

            this.#data[i] = entry;
        }

        const dataSource =
            /** @type {import("../../data/sources/inlineSource.js").default} */ (
                this.#view.flowHandle?.dataSource
            );

        if (!dataSource) {
            return;
        }

        dataSource.updateDynamicData(this.#data);

        this.#domains.x[1] = coords.width;
        this.#domains.y[1] = coords.height;

        const xScale = this.#view.getScaleResolution("x")?.getScale();
        if (xScale) {
            xScale.domain(this.#domains.x);
        }

        const yScale = this.#view.getScaleResolution("y")?.getScale();
        if (yScale) {
            yScale.domain(this.#domains.y);
        }
    }

    /**
     * @param {Omit<import("../../spec/view.js").SeparatorProps, "includePlotMargin">} props
     * @param {import("../../types/viewContext.js").default} context
     * @param {import("../containerView.js").default} layoutParent
     * @param {import("../view.js").default} dataParent
     * @param {(prefix: string) => string} getName
     * @returns {UnitView}
     */
    #createView(props, context, layoutParent, dataParent, getName) {
        const spec = createSeparatorSpec(props);
        const name =
            this.#direction === "horizontal"
                ? getName("separatorHorizontal")
                : getName("separatorVertical");

        const view = new UnitView(
            spec,
            context,
            layoutParent,
            dataParent,
            name,
            {
                blockEncodingInheritance: true,
            }
        );

        markViewAsNonAddressable(view, { skipSubtree: true });

        return view;
    }
}

/**
 * @param {import("../../spec/view.js").SeparatorProps | boolean | undefined} separator
 * @returns {import("../../spec/view.js").SeparatorProps | null}
 */
export function resolveSeparatorProps(separator) {
    if (!separator) {
        return null;
    }

    const props =
        separator === true
            ? { ...DEFAULT_SEPARATOR_PROPS }
            : { ...DEFAULT_SEPARATOR_PROPS, ...separator };

    if (props.strokeDash === DEFAULT_SEPARATOR_PROPS.strokeDash) {
        props.strokeDash = DEFAULT_SEPARATOR_PROPS.strokeDash.slice();
    }

    return props;
}

/**
 * @param {Omit<import("../../spec/view.js").SeparatorProps, "includePlotMargin">} props
 * @returns {import("../../spec/view.js").UnitSpec}
 */
function createSeparatorSpec(props) {
    return {
        configurableVisibility: false,
        domainInert: true,
        data: { values: [] },
        resolve: {
            scale: { x: "excluded", y: "excluded" },
            axis: { x: "excluded", y: "excluded" },
        },
        mark: {
            ...props,
            type: "rule",
            clip: props.clip ?? false,
            tooltip: null,
        },
        encoding: {
            x: {
                field: "x",
                type: "quantitative",
                scale: { nice: false, zero: false },
            },
            y: {
                field: "y",
                type: "quantitative",
                scale: { nice: false, zero: false },
            },
            x2: { field: "x2" },
            y2: { field: "y2" },
        },
    };
}
