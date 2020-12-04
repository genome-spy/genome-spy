import { html } from "lit-html";
import { classMap } from "lit-html/directives/class-map.js";

import { field as vegaField } from "vega-util";
import { inferType } from "vega-loader";

import ConcatView from "../concatView";
import UnitView from "../unitView";
import { getCachedOrCall } from "../../utils/propertyCacher";
import * as Actions from "../../sampleHandler/sampleHandlerActions";
import contextMenu from "../../utils/ui/contextMenu";
import generateAttributeContextMenu from "./attributeContextMenu";
import formatObject from "../../utils/formatObject";

// TODO: Move to a more generic place
const FieldType = {
    NOMINAL: "nominal",
    ORDINAL: "ordinal",
    QUANTITATIVE: "quantitative"
};

const SAMPLE_ATTRIBUTE = "SAMPLE_ATTRIBUTE";
const SAMPLE_NAME = "SAMPLE_NAME";

/**
 * This special-purpose class takes care of rendering sample labels and metadata.
 *
 * @typedef {import("./sampleView").Sample} Sample
 * @typedef {import("../view").default} View
 *
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

        // TODO: Optimize the following
        this.sampleHandler.addAttributeInfoSource(SAMPLE_ATTRIBUTE, attribute =>
            this.children
                .map(this.getAttributeInfoFromView.bind(this))
                .find(info => info && info.name == attribute.specifier)
        );

        this.sampleHandler.addAttributeInfoSource(SAMPLE_NAME, attribute => ({
            name: "displayName",
            accessor: sampleId =>
                this.parent.sampleAccessor(sampleId).displayName,
            type: "nominal",
            scale: undefined
        }));

        this.addEventListener("contextmenu", this.handleContextMenu.bind(this));

        this.addEventListener("mousemove", (coords, event) => {
            const sample = this._findSampleForMouseEvent(coords, event);
            if (sample) {
                const attribute =
                    (event.target &&
                        this.getAttributeInfoFromView(event.target)?.name) ||
                    undefined;
                // The following breaks if sample or attribute name contains *
                const id = `${sample.id}*${attribute}`;
                this.context.genomeSpy.updateTooltip(id, id =>
                    this.sampleToTooltip(id)
                );
            }
        });
    }

    get sampleHandler() {
        return this.parent.sampleHandler;
    }

    getData() {
        // SampleView maintains the sample data
        return this.parent.getAllSamples();
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
     * @param {import("../renderingContext/viewRenderingContext").default} context
     * @param {import("../../utils/layout/rectangle").default} coords
     * @param {import("../view").RenderingOptions} [options]
     */
    render(context, coords, options = {}) {
        for (const sampleLocation of this.parent.getSampleLocations()) {
            super.render(context, coords, {
                ...options,
                sampleFacetRenderingOptions: {
                    locSize: sampleLocation.location
                },
                facetId: sampleLocation.sampleId
            });
        }
    }

    /**
     * @param {import("../../utils/layout/rectangle").default} coords
     *      Coordinates of the view
     * @param {import("../../utils/interactionEvent").default} event
     */
    _findSampleForMouseEvent(coords, event) {
        const sampleId = this.parent.getSampleIdAt(
            1 - coords.normalizePoint(event.point.x, event.point.y).y
        );

        return sampleId ? this.parent.sampleMap.get(sampleId) : undefined;
    }

    /**
     * @param {import("../../utils/layout/rectangle").default} coords
     *      Coordinates of the view
     * @param {import("../../utils/interactionEvent").default} event
     */
    handleContextMenu(coords, event) {
        const mouseEvent = /** @type {MouseEvent} */ (event.uiEvent);

        const sample = this._findSampleForMouseEvent(coords, event);

        if (!sample) {
            mouseEvent.preventDefault();
            return;
        }

        const dispatch = this.sampleHandler.dispatch.bind(this.sampleHandler);

        /** @type {import("../../utils/ui/contextMenu").MenuItem[]} */
        const items = [];

        const attribute = this.getAttributeInfoFromView(event.target);
        if (attribute) {
            const attributeValue = sample.attributes[attribute.name];
            items.push(
                ...generateAttributeContextMenu(
                    html`
                        Attribute: <strong>${attribute.name}</strong>
                    `,
                    { type: SAMPLE_ATTRIBUTE, specifier: attribute.name },
                    attribute.type,
                    attributeValue,
                    dispatch,
                    this.sampleHandler.provenance
                )
            );
        } else {
            items.push(...this.generateSampleContextMenu(sample, dispatch));
        }

        // TODO: Better integration with tooltip. Put the logic to contextMenu somehow.
        // ... or provide contextMenu through ViewContext
        this.context.genomeSpy.tooltip.visible = false;

        contextMenu({ items }, mouseEvent);
    }

    setupAttributeViews() {
        const addedChildViews = this._createAttributeViewSpecs().map(spec =>
            this.addChild(spec)
        );

        for (const view of addedChildViews) {
            if (view instanceof UnitView) {
                // TODO: Move initialization to viewUtils
                view.resolve("scale");
                view.resolve("axis");
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
        return this.parent.spec.samples?.attributes?.[attributeName];
    }

    _getAttributeNames() {
        return getCachedOrCall(this, "attributeNames", () => {
            const samples = this.parent.getAllSamples();

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
        const samples = this.parent.getAllSamples();

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
        // This is a bit fragile.. +1 is for skipping the sample label
        return this.children[this._getAttributeNames().indexOf(attribute) + 1];
    }

    /**
     * @param {View} view
     * @returns {import("../../sampleHandler/sampleHandler").AttributeInfo}
     */
    getAttributeInfoFromView(view) {
        const nameMatch = view.name.match(/attribute-(.*)/);
        if (nameMatch) {
            // Foolhardily assume that color is always used for encoding.
            const resolution = view.getScaleResolution("color");

            const attribute = nameMatch[1];

            const sampleAccessor = this.parent.sampleAccessor;

            /** @param {string} sampleId */
            const accessor = sampleId => {
                const sample = sampleAccessor(sampleId);
                return sample.attributes[attribute];
            };

            return {
                name: attribute,
                accessor,
                type: resolution.type,
                scale: resolution.getScale()
            };
        }
    }

    /**
     *
     * @param {string} attribute
     */
    getAttributeInfo(attribute) {
        return this.getAttributeInfoFromView(
            this._findViewForAttribute(attribute)
        );
    }

    /**
     * TODO: Move to a separate file
     *
     * @param {Sample} sample
     * @param {function(object):void} dispatch
     * @returns {import("../../utils/ui/contextMenu").MenuItem[]}
     */
    generateSampleContextMenu(sample, dispatch) {
        return [
            {
                label: "Sort by name",
                callback: () => dispatch(Actions.sortBy({ type: SAMPLE_NAME }))
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

    /**
     *
     * @param {string} sampleAndAttribute
     */
    sampleToTooltip(sampleAndAttribute) {
        const [_, sampleId, attribute] = sampleAndAttribute.match(
            /^(.+)\*(.*)$/
        );

        const sample = this.parent.sampleMap.get(sampleId);

        /**
         * @param {string} attribute
         * @param {any} value
         */
        const getColor = (attribute, value) =>
            isDefined(value)
                ? this.getAttributeInfo(attribute).scale(value)
                : "transparent";

        const table = html`
            <table class="attributes">
                ${Object.entries(sample.attributes).map(
                    ([key, value]) => html`
                        <tr class=${classMap({ hovered: key == attribute })}>
                            <th>${key}</th>
                            <td>${formatObject(value)}</td>
                            <td
                                class="color"
                                .style="background-color: ${getColor(
                                    key,
                                    value
                                )}"
                            ></td>
                        </tr>
                    `
                )}
            </table>
        `;

        return html`
            <div class="sample-track-sample-tooltip">
                <div class="title">
                    <strong>${sample.displayName || sample.id}</strong>
                </div>
                ${table}
            </div>
        `;
    }

    /**
     * @param {string} channel
     * @param {import("../containerView").ResolutionType} resolutionType
     */
    getDefaultResolution(channel, resolutionType) {
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
 * @param {import("../../spec/view").SampleAttributeDef} attributeDef
 */
function createAttributeSpec(attributeName, attributeDef) {
    const field = `attributes["${attributeName}"]`;

    /** @type {import("../viewUtils").UnitSpec} */
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

    /** @type {import("../viewUtils").UnitSpec} */
    const titleSpec = {
        name: "sampleLabel",
        width: 140,
        mark: {
            type: "text",
            align: "left",
            baseline: "middle",
            flushY: false
        },
        encoding: {
            x: { value: 0 },
            x2: { value: 1 },
            y: { value: 0 },
            y2: { value: 1 },
            text: { field: "displayName", type: "nominal" },
            size: { value: 11 }

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
        value !== "" &&
        !(typeof value == "number" && isNaN(value)) &&
        value !== null
    );
}
