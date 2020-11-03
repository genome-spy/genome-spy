import { field as vegaField } from "vega-util";
import { inferType } from "vega-loader";
import { format as d3format } from "d3-format";

import { DataGroup } from "../data/group";
import ConcatView from "./concatView";
import UnitView from "./unitView";
import { getCachedOrCall } from "../utils/propertyCacher";
import * as Actions from "../sampleHandler/sampleHandlerActions";
import contextMenu from "../contextMenu";

// TODO: Move to a more generic place
const FieldType = {
    NOMINAL: "nominal",
    ORDINAL: "ordinal",
    QUANTITATIVE: "quantitative"
};

/**
 * This special-purpose class takes care of rendering sample labels and metadata.
 *
 * @typedef {import("../sampleHandler/sampleHandler").Sample} Sample
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

    get sampleHandler() {
        return this.parent.sampleHandler;
    }

    getData() {
        // SampleView maintains the sample data
        return new DataGroup(
            "sample attributes",
            this.sampleHandler.allSamples
        );
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
     * @param {import("./renderingContext/viewRenderingContext").default} context
     * @param {import("../utils/layout/rectangle").default} coords
     * @param {import("./view").RenderingOptions} [options]
     */
    render(context, coords, options = {}) {
        for (const sampleLocation of this.parent.getSampleLocations()) {
            super.render(context, coords, {
                ...options,
                sampleFacetRenderingOptions: {
                    pos: sampleLocation.location.location,
                    height: sampleLocation.location.size
                },
                facetId: sampleLocation.sampleId
            });
        }
    }

    /**
     * @param {import("../utils/layout/rectangle").default} coords
     *      Coordinates of the view
     * @param {import("../utils/interactionEvent").default} event
     * @param {boolean} capturing
     */
    handleInteractionEvent(coords, event, capturing) {
        // TODO: Allow for registering listeners
        if (!capturing && event.type == "contextmenu") {
            const mouseEvent = /** @type {MouseEvent} */ (event.uiEvent);

            const sampleId = this.parent.getSampleIdAt(
                1 - coords.normalizePoint(event.point.x, event.point.y).y
            );

            const sample = sampleId
                ? this.sampleHandler.sampleMap.get(sampleId)
                : undefined;

            if (!sample) {
                mouseEvent.preventDefault();
                return;
            }

            /** @param {any} action */
            const dispatch = action => {
                this.sampleHandler.dispatch(action);

                // TODO: Abstract this stuff
                this.context.genomeSpy.computeLayout();
                this.context.genomeSpy.renderAll();
            };

            const attribute = getAttributeInfoFromView(event.target);
            if (attribute) {
                const attributeValue = sample.attributes[attribute.name];

                contextMenu(
                    {
                        items: this.generateAttributeContextMenu(
                            attribute.name,
                            attribute.type,
                            attributeValue,
                            dispatch
                        )
                    },
                    mouseEvent
                );
            } else {
                contextMenu(
                    {
                        items: this.generateSampleContextMenu(sample, dispatch)
                    },
                    mouseEvent
                );
            }
        }
    }

    setupAttributeViews() {
        const addedChildViews = this._createAttributeViewSpecs().map(spec =>
            this.addChild(spec)
        );

        for (const view of addedChildViews) {
            if (view instanceof UnitView) {
                // TODO: Move initialization to viewUtils
                view.resolve();
                view.mark.initializeEncoders();
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

    _getAttributeNames() {
        return getCachedOrCall(this, "attributeNames", () => {
            const samples = this.sampleHandler.allSamples;

            // Find all attributes
            const attributes = samples
                .flatMap(sample => Object.keys(sample.attributes))
                .reduce(
                    (set, key) => set.add(key),
                    /** @type {Set<string>} */ (new Set())
                );

            return [...attributes];
        });
    }

    /**
     * Builds views for attributes
     */
    _createAttributeViewSpecs() {
        const samples = this.sampleHandler.allSamples;

        return this._getAttributeNames().map(attributeName => {
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

            return createAttributeSpec(attributeName, {
                ...(attributeDef || {}),
                type: fieldType
            });
        });
    }

    /**
     * Returns the view that displays the given attribute.
     *
     * @param {string} attribute
     */
    _findViewForAttribute(attribute) {
        // This is a bit fragile.. +1 is for skipping the sample lable
        return this.children[this._getAttributeNames().indexOf(attribute) + 1];
    }

    /**
     * TODO: Move to a separate file
     *
     * @param {string} attribute
     * @param {string} attributeType
     * @param {any} attributeValue
     * @param {function(object):void} dispatch
     */
    generateAttributeContextMenu(
        attribute,
        attributeType,
        attributeValue,
        dispatch
    ) {
        /** @type {import("../contextMenu").MenuItem[]} */
        let items = [
            {
                label: `Attribute: ${attribute}`,
                type: "header"
            },
            {
                label: "Sort by",
                callback: () => dispatch(Actions.sortByAttribute(attribute))
            }
        ];

        const nominal = attributeType != "quantitative";

        if (nominal) {
            items.push({
                label: "Retain first sample of each",
                callback: () => dispatch(Actions.retainFirstOfEach(attribute))
            });
        }

        if (nominal) {
            items.push({ type: "divider" });
            items.push({
                label:
                    attributeValue === null
                        ? `Samples with undefined ${attribute}`
                        : `Samples with ${attribute} = ${attributeValue}`,
                type: "header"
            });

            items.push({
                label: "Retain",
                callback: () =>
                    dispatch(
                        Actions.filterByNominalAttribute(attribute, "retain", [
                            attributeValue
                        ])
                    )
            });

            items.push({
                label: "Remove",
                callback: () =>
                    dispatch(
                        Actions.filterByNominalAttribute(attribute, "remove", [
                            attributeValue
                        ])
                    )
            });
        } else {
            const numberFormat = d3format(".4");

            items.push({ type: "divider" });

            if (isDefined(attributeValue)) {
                items.push({
                    label: `Remove ${attribute} less than ${numberFormat(
                        attributeValue
                    )}`,
                    callback: () =>
                        dispatch(
                            Actions.filterByQuantitativeAttribute(
                                attribute,
                                "gte",
                                attributeValue
                            )
                        )
                });

                items.push({
                    label: `Remove ${attribute} greater than ${numberFormat(
                        attributeValue
                    )}`,
                    callback: () =>
                        dispatch(
                            Actions.filterByQuantitativeAttribute(
                                attribute,
                                "lte",
                                attributeValue
                            )
                        )
                });
            } else {
                items.push({
                    label: `Remove undefined ${attribute}`,
                    callback: () =>
                        dispatch(Actions.filterByUndefinedAttribute(attribute))
                });
            }
        }

        return items;
    }

    /**
     * TODO: Move to a separate file
     *
     * @param {Sample} sample
     * @param {function(object):void} dispatch
     * @returns {import("../contextMenu").MenuItem[]}
     */
    generateSampleContextMenu(sample, dispatch) {
        return [
            {
                label: "Sort by name",
                callback: () => dispatch(Actions.sortByName())
            },
            {
                label: `Sample: ${sample.displayName}`,
                type: "header"
            },
            {
                label: "Retain",
                callback: () => alert("TODO")
            },
            {
                label: "Remove",
                callback: () => alert("TODO")
            }
        ];
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
 * @param {View} view
 */
function getAttributeInfoFromView(view) {
    const nameMatch = view.name.match(/attribute-(.*)/);
    if (nameMatch) {
        // Foolhardily assume that color is always used for encoding.
        const resolution = view.getResolution("color");
        return {
            name: nameMatch[1],
            type: resolution.type,
            scale: resolution.getScale()
        };
    }
}

/**
 * @param {string} attributeName
 * @param {import("../spec/view").SampleAttributeDef} attributeDef
 */
function createAttributeSpec(attributeName, attributeDef) {
    const field = `attributes["${attributeName}"]`;

    /** @type {import("./viewUtils").UnitSpec} */
    const attributeSpec = {
        name: `attribute-${attributeName}`,
        width: attributeDef.width || 10,
        transform: [{ type: "filter", expr: `datum.${field} != null` }],
        mark: {
            type: "rect"
        },
        encoding: {
            color: {
                field,
                type: attributeDef.type,
                scale: attributeDef.colorScale
            }
        }
    };

    if (attributeDef.barScale && attributeDef.type == FieldType.QUANTITATIVE) {
        attributeSpec.encoding.x = {
            field: `attributes["${attributeName}"]`,
            type: attributeDef.type,
            scale: attributeDef.barScale,
            axis: null
        };
    }

    return attributeSpec;
}

function createLabelViewSpec() {
    // TODO: Support styling: https://vega.github.io/vega-lite/docs/header.html#labels

    /** @type {import("./viewUtils").UnitSpec} */
    const titleSpec = {
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

    return titleSpec;
}

/**
 *
 * @param {any} value
 */
function isDefined(value) {
    return (
        value !== undefined &&
        value !== null &&
        value !== "" &&
        !(typeof value == "number" && isNaN(value))
    );
}
