import { getViewClass, isFacetFieldDef, isFacetMapping } from "./viewUtils";
import ContainerView from "./containerView";
import UnitView from "./unitView";
import { getCachedOrCall } from "../utils/propertyCacher";
import { range, cross, group } from "d3-array";
import { mapToPixelCoords } from "../utils/layout/flexLayout";
import { OrdinalDomain } from "../utils/domainArray";
import Rectangle from "../utils/layout/rectangle";
import coalesce from "../utils/coalesce";
import { field as vegaField, isNumber } from "vega-util";
import AxisWrapperView from "./axisWrapperView";
import Padding from "../utils/layout/padding";

/**
 * Implements faceting of multiple samples. The samples are displayed
 * as tracks and optional metadata.
 *
 * @typedef {import("../utils/layout/flexLayout").LocSize} LocSize
 * @typedef {import("./view").default} View
 * @typedef {import("./layerView").default} LayerView
 */
export default class SampleView extends ContainerView {
    /**
     *
     * @param {import("./viewUtils").FacetSpec} spec
     * @param {import("./viewUtils").ViewContext} context
     * @param {ContainerView} parent
     * @param {string} name
     */
    constructor(spec, context, parent, name) {
        super(spec, context, parent, name);

        this.spec = spec;

        const View = getViewClass(spec.spec);
        this.child = /** @type { UnitView | LayerView | AxisWrapperView } */ (new View(
            spec.spec,
            context,
            this,
            `sample`
        ));

        /** @type {UnitView[]} Views for attributes */
        this.attributeViews = [];

        /** @type {UnitView} Labels for sample ids */
        this.labelView = undefined;
    }

    /**
     * @returns {IterableIterator<View>}
     */
    *[Symbol.iterator]() {
        yield this.child;
    }

    /**
     * @param {import("./view").default} child
     * @param {import("./view").default} replacement
     */
    replaceChild(child, replacement) {
        if (child !== this.child) {
            throw new Error("Not my child!");
        }

        this.child = /** @type {UnitView | LayerView | AxisWrapperView} */ (replacement);
    }

    /**
     * @param {import("../utils/layout/rectangle").default} coords
     * @param {import("./view").RenderingOptions} [options]
     * @param {import("./view").DeferredRenderingRequest[]} [deferBuffer]
     */
    render(coords, options = {}, deferBuffer) {
        coords = coords.shrink(this.getPadding());

        const sampleIds = this.getResolution("sample").getDataDomain();

        const locations = mapToPixelCoords(
            sampleIds.map(d => ({ grow: 1 })),
            1.0, // Unit coords, not pixels coords
            {
                spacing: 0,
                devicePixelRatio: null
            }
        );

        if (deferBuffer) {
            console.warn("deferBuffer is already defined!");
        }

        // Collect rendering requests so that their order can be optimized
        deferBuffer = [];

        for (let i = 0; i < sampleIds.length; i++) {
            const location = locations[i];
            this.child.render(
                coords,
                {
                    ...options,
                    sampleFacetRenderingOptions: {
                        pos: location.location,
                        height: location.size
                    },
                    facetId: sampleIds[i]
                },
                deferBuffer
            );
        }

        this._renderDeferred(deferBuffer);
    }
}

/**
 *
 * @param {LocSize[]} locations
 */
function locationsToTextureData(locations) {
    // Create a RG32F texture
    const arr = new Float32Array(locations.length * 2);
    let i = 0;
    for (const location of locations) {
        arr[i++] = location.location;
        arr[i++] = location.size;
    }
    return arr;
}

function createLabelViewSpec() {
    // TODO: Support styling: https://vega.github.io/vega-lite/docs/header.html#labels

    /** @type {import("./viewUtils").UnitSpec} */
    const titleView = {
        data: {
            values: []
        },
        mark: {
            type: "text",
            clip: false
        },
        encoding: {
            text: { field: "data", type: "nominal" },
            size: { value: headerConfig.labelFontSize },
            color: { value: headerConfig.labelColor }
        }
    };

    return titleView;
}
