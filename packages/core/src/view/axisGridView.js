import LayerView from "./layerView.js";
import { orient2channel } from "./axisView.js";

/**
 * @typedef {import("../spec/channel").PrimaryPositionalChannel} PositionalChannel
 * @typedef {import("../spec/view").GeometricDimension} GeometricDimension
 */

/**
 * An internal view that renders an axis grid.
 *
 * @typedef {import("./view").default} View
 * @typedef {import("../spec/axis").Axis} Axis
 * @typedef {import("../spec/axis").GenomeAxis} GenomeAxis
 */
export default class AxisGridView extends LayerView {
    /**
     * @param {Axis} axisProps
     * @param {import("../types/viewContext").default} context
     * @param {string} type Data type (quantitative, ..., locus)
     * @param {import("./containerView").default} layoutParent
     * @param {import("./view").default} dataParent
     * @param {import("./view").ViewOptions} [options]
     */
    constructor(axisProps, type, context, layoutParent, dataParent, options) {
        // Now the presence of genomeAxis is based on field type, not scale type.
        // TODO: Use scale instead. However, it would make the initialization much more
        // complex because scales are not available before scale resolution.
        const genomeAxis = type == "locus";

        /** @type {Axis | GenomeAxis} */
        const fullAxisProps = {
            ...(genomeAxis ? defaultGenomeAxisProps : defaultAxisProps),
            ...axisProps,
        };

        super(
            createAxisGrid(fullAxisProps, type),
            context,
            layoutParent,
            dataParent,
            `axisGrid_${axisProps.orient}`,
            {
                blockEncodingInheritance: true,
                contributesToScaleDomain: false,
                ...options,
            }
        );

        this.axisProps = fullAxisProps;
    }

    getOrient() {
        return this.axisProps.orient;
    }

    isPickingSupported() {
        return false;
    }
}

/**
 * Based on: https://vega.github.io/vega-lite/docs/axis.html
 * TODO: The defaults should be taken from config (theme)
 *
 * @type {Axis}
 */
const defaultAxisProps = {
    values: null,

    grid: false,
    gridCap: "butt",
    gridColor: "lightgray",
    gridDash: null,
    gridOpacity: 1,
    gridWidth: 1,

    tickCount: null,
    tickMinStep: null,
};

/**
 * @type {import("../spec/axis").GenomeAxis}
 */
const defaultGenomeAxisProps = {
    ...defaultAxisProps,

    chromGrid: false,
    chromGridCap: "butt",
    chromGridColor: "gray",
    chromGridDash: [1, 5],
    chromGridOpacity: 1,
    chromGridWidth: 1,
};

/**
 * @param {Axis} axisProps
 * @param {string} type
 * @returns {import("../spec/view").UnitSpec}
 */
function createRegularAxisGrid(axisProps, type) {
    const ap = axisProps;
    const channel = orient2channel(ap.orient);

    return {
        name: "grid_lines",
        data: {
            lazy: {
                type: "axisTicks",
                channel,
                axis: axisProps,
            },
        },
        mark: {
            type: "rule",
            strokeDash: ap.gridDash,
            strokeCap: ap.gridCap,
            color: ap.gridColor,
            size: ap.gridWidth,
            opacity: ap.gridOpacity,
            minBufferSize: 300,
        },
        encoding: {
            [channel]: { field: "value", type },
        },
    };
}

/**
 * @param {import("../spec/axis").GenomeAxis} axisProps
 * @param {string} type
 * @returns {import("../spec/view").UnitSpec}
 */
function createChromAxisGrid(axisProps, type) {
    const ap = axisProps;
    const channel = orient2channel(ap.orient);

    return {
        name: "chromosome_lines",
        data: {
            lazy: {
                type: "axisGenome",
                channel,
            },
        },
        mark: {
            type: "rule",
            strokeDash: ap.chromGridDash,
            strokeCap: ap.chromGridCap,
            color: ap.chromGridColor,
            size: ap.chromGridWidth,
            opacity: ap.chromGridOpacity,
        },
        encoding: {
            // TODO: { chrom: "name", type: "locus" } // without pos = pos is 0
            [channel]: { field: "continuousStart", type, band: 0 },
        },
    };
}

/**
 * @param {import("../spec/axis").GenomeAxis} axisProps
 * @param {string} type
 * @returns {import("../spec/view").UnitSpec}
 */
function createChromAxisFill(axisProps, type) {
    const ap = axisProps;
    const channel = orient2channel(ap.orient);

    return {
        name: "chromosome_fill",
        data: {
            lazy: {
                type: "axisGenome",
                channel,
            },
        },
        mark: {
            type: "rect",
        },
        encoding: {
            // TODO: { chrom: "name", type: "locus" } // without pos = pos is 0
            [channel]: { field: "continuousStart", type, band: 0 },
            [channel + "2"]: { field: "continuousEnd", band: 0 },
            fill: {
                field: "odd",
                type: "nominal",
                scale: {
                    domain: [false, true],
                    range: [
                        ap.chromGridFillEven ?? "white",
                        ap.chromGridFillOdd ?? "white",
                    ],
                },
            },
            // Could be replaced with filter transform...
            opacity: {
                field: "odd",
                type: "nominal",
                scale: {
                    type: "ordinal",
                    domain: [false, true],
                    range: [
                        ap.chromGridFillEven ? 1 : 0,
                        ap.chromGridFillOdd ? 1 : 0,
                    ],
                },
            },
        },
    };
}

/**
 * @param {GenomeAxis} axisProps
 * @param {string} type
 * @returns {import("../spec/view").LayerSpec}
 */
function createAxisGrid(axisProps, type) {
    const ap = { ...axisProps };

    /**
     * @type {(import("../spec/view").UnitSpec | import("../spec/view").LayerSpec)[]}
     */
    const layers = [];

    if (ap.chromGrid && (ap.chromGridFillOdd || ap.chromGridFillEven)) {
        layers.push(createChromAxisFill(ap, type));
    }

    if (ap.chromGrid && ap.chromGridOpacity > 0) {
        layers.push(createChromAxisGrid(ap, type));
    }

    if (ap.grid && ap.gridOpacity > 0) {
        layers.push(createRegularAxisGrid(ap, type));
    }

    return {
        name: "grid_layers",
        configurableVisibility: false,
        resolve: {
            scale: {
                [orient2channel(axisProps.orient)]: "forced",
                fill: "independent",
                opacity: "independent",
            },
        },
        layer: layers,
    };
}
