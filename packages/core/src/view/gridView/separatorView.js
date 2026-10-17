import UnitView from "../unitView.js";
import {
    markViewAsChrome,
    markViewAsNonAddressable,
} from "../viewSelectors.js";

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

    /** @type {number} */
    #zindex;

    /** @type {import("../../data/flowNode.js").Datum[]} */
    #data = [];

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
        this.#zindex = props.zindex ?? 0;
        const markProps = { ...props };
        delete markProps.includePlotMargin;
        delete markProps.zindex;
        this.#view = new UnitView(
            createSeparatorSpec(markProps),
            context,
            layoutParent,
            dataParent,
            getName(
                direction === "horizontal"
                    ? "separatorHorizontal"
                    : "separatorVertical"
            )
        );
        markViewAsNonAddressable(this.#view, { skipSubtree: true });
        markViewAsChrome(this.#view, { skipSubtree: true });
    }

    /**
     * @returns {UnitView}
     */
    get view() {
        return this.#view;
    }

    getZindex() {
        return this.#zindex;
    }

    /**
     * @param {import("../layout/flexLayout.js").LocSize[]} flexCoords
     * @param {number} count
     * @param {import("../layout/rectangle.js").default} coords
     * @param {(index: number) => number} getViewSlot
     * @param {import("../layout/padding.js").default} overhang
     */
    update(flexCoords, count, coords, getViewSlot, overhang) {
        const xStart = this.#includePlotMargin ? 0 : overhang.left;
        const xEnd = this.#includePlotMargin
            ? coords.width
            : coords.width - overhang.right;
        const yStart = this.#includePlotMargin ? 0 : overhang.bottom;
        const yEnd = this.#includePlotMargin
            ? coords.height
            : coords.height - overhang.top;
        // A collapsed canvas has no visible span, but normalized data must stay finite.
        const width = coords.width || 1;
        const height = coords.height || 1;
        const vertical = this.#direction === "vertical";
        this.#data.length = Math.max(0, count - 1);

        for (let index = 1; index < count; index++) {
            const spacing = flexCoords[getViewSlot(index) - 2];
            const position = spacing.location + spacing.size / 2;
            const entry = this.#data[index - 1] ?? {};
            entry.x = (vertical ? position : xStart) / width;
            entry.x2 = (vertical ? position : xEnd) / width;
            entry.y = (vertical ? yStart : coords.height - position) / height;
            entry.y2 = (vertical ? yEnd : coords.height - position) / height;
            this.#data[index - 1] = entry;
        }

        const dataSource =
            /** @type {import("../../data/sources/inlineSource.js").default} */ (
                this.#view.flowHandle?.dataSource
            );
        dataSource?.updateDynamicData(this.#data);
    }

    /**
     * @param {import("../renderingContext/viewRenderingContext.js").default} context
     * @param {import("../layout/rectangle.js").default} coords
     * @param {import("../../types/rendering.js").RenderingOptions} options
     */
    arrange(context, coords, options) {
        this.#view.arrange(context, coords, options);
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
                scale: null,
            },
            y: {
                field: "y",
                type: "quantitative",
                scale: null,
            },
            x2: { field: "x2" },
            y2: { field: "y2" },
        },
    };
}
