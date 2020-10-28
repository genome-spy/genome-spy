import { field, field as vegaField, isNumber } from "vega-util";
import { inferType } from "vega-loader";

import { DataGroup } from "../data/group";
import createDomain from "../utils/domainArray";
import ConcatView from "./concatView";
import UnitView from "./unitView";

// TODO: Move to a more generic place
const FieldType = {
    NOMINAL: "nominal",
    ORDINAL: "ordinal",
    QUANTITATIVE: "quantitative"
};

/**
 * This special-purpose class takes care of rendering sample labels and metadata.
 *
 * @typedef {import("./view").default} View
 */
export class SampleAttributePanel extends ConcatView {
    /**
     * @param {import("./sampleView").default} sampleView
     */
    constructor(sampleView) {
        super(
            {
                hconcat: [createLabelViewSpec()],
                spacing: 1
            },
            sampleView.context,
            sampleView,
            "sampleAttributes"
        );

        this.parent = sampleView;
    }

    getData() {
        // SampleView maintains the sample data
        return new DataGroup("sample attributes", this.parent.sampleData);
    }

    transformData() {
        super.transformData();
        // A hacky solution for updating stuff. TODO: Something more robust.

        this.setupAttributeViews();
    }

    /**
     * @param {View} [whoIsAsking]
     */
    getFacetAccessor(whoIsAsking) {
        // All children display faceted data
        return vegaField("id");
    }

    getEncoding(whoIsAsking) {
        // Block all inheritance
        return {};
    }

    /**
     * @param {import("../utils/layout/rectangle").default} coords
     * @param {import("./view").RenderingOptions} [options]
     * @param {import("./view").DeferredRenderingRequest[]} [deferBuffer]
     */
    render(coords, options, deferBuffer) {
        // Fugly hack. TODO: Figure out a systematic phase for doing this
        /*
        if (!this._labelsUpdated) {
            this.updateData();
            this._labelsUpdated = true;
        }
        */

        for (const sampleLocation of this.parent.getSampleLocations()) {
            super.render(
                coords,
                {
                    ...options,
                    sampleFacetRenderingOptions: {
                        pos: sampleLocation.location.location,
                        height: sampleLocation.location.size
                    },
                    facetId: sampleLocation.sampleId
                },
                deferBuffer
            );
        }
    }

    setupAttributeViews() {
        const addedChildViews = this.createAttributeViewSpecs().map(spec =>
            this.addChild(spec)
        );

        for (const view of addedChildViews) {
            if (view instanceof UnitView) {
                view.resolve();
                //view.mark.initializeData();
                view.mark.initializeEncoders();
                //view.mark.updateGraphicsData();
                view.updateData();
                // Async:
                view.mark.initializeGraphics();
            }
        }
    }

    /**
     *
     * @param {string} attributeName
     */
    _getAttributeDef(attributeName) {
        return (
            this.parent.spec.samples &&
            this.parent.spec.samples.attributes &&
            this.parent.spec.samples.attributes[attributeName]
        );
    }

    /**
     * Builds views for attributes
     */
    createAttributeViewSpecs() {
        const samples = [...this.getData().flatData()];

        // Find all attributes
        const attributeNames = samples
            .flatMap(sample => Object.keys(sample.attributes))
            .reduce((set, key) => set.add(key), new Set());

        return [...attributeNames].map(attributeName => {
            const attributeDef = this._getAttributeDef(attributeName);

            // Ensure that attributes have a type
            let fieldType = attributeDef ? attributeDef.type : undefined;
            if (!fieldType) {
                switch (
                    inferType(
                        samples.map(sample => sample.attributes[attributeName])
                    )
                ) {
                    case "integer":
                    case "number":
                        fieldType = FieldType.QUANTITATIVE;
                        break;
                    default:
                        fieldType = FieldType.NOMINAL;
                }
            }

            return createHeatmapSpec(attributeName, {
                ...(attributeDef || {}),
                type: fieldType
            });
        });
    }

    getDefaultResolution(channel) {
        return "independent";
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

/**
 * @param {string} attributeName
 * @param {import("../spec/view").SampleAttributeDef} attributeDef
 */
function createHeatmapSpec(attributeName, attributeDef) {
    /** @type {import("./viewUtils").UnitSpec} */
    const heatmapView = {
        width: attributeDef.width || 10,
        mark: {
            type: "rect"
        },
        encoding: {
            color: {
                field: `attributes["${attributeName}"]`,
                type: attributeDef.type,
                scale: attributeDef.scale
            }
        }
    };

    return heatmapView;
}

function createBarSpec(field) {
    /** @type {import("./viewUtils").UnitSpec} */
    const heatmapView = {
        width: 40,
        mark: {
            type: "rect"
        },
        encoding: {
            x: {
                field: `attributes.${field}`,
                type: "quantitative",
                axis: null,
                scale: { reverse: true }
            },
            color: { field: `attributes.${field}`, type: "quantitative" }
        }
    };

    return heatmapView;
}

function createLabelViewSpec() {
    // TODO: Support styling: https://vega.github.io/vega-lite/docs/header.html#labels

    /** @type {import("./viewUtils").UnitSpec} */
    const titleView = {
        name: "sampleLabel",
        width: 150,
        mark: {
            type: "text",
            align: "left",
            clip: false
        },
        encoding: {
            x: { value: 0 },
            y: { value: 0.5 },
            text: { field: "displayName", type: "nominal" },
            size: { value: 8 }

            //size: { value: headerConfig.labelFontSize },
            //color: { value: headerConfig.labelColor }
        }
    };

    return titleView;
}
