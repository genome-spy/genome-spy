import { html } from "lit";
import { classMap } from "lit/directives/class-map.js";

import { inferType } from "vega-loader";

import ConcatView from "../concatView";
import UnitView from "../unitView";
import * as Actions from "../../sampleHandler/sampleHandlerActions";
import generateAttributeContextMenu from "./attributeContextMenu";
import formatObject from "../../utils/formatObject";
import { buildDataFlow } from "../flowBuilder";
import { NOMINAL, ORDINAL } from "../scaleResolution";

// TODO: Move to a more generic place
const FieldType = {
    NOMINAL: "nominal",
    ORDINAL: "ordinal",
    QUANTITATIVE: "quantitative",
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
                data: { dynamicSource: true },
                hconcat: [], // Contents are added dynamically
                spacing: 1,
            },
            sampleView.context,
            undefined,
            "sampleAttributes"
        );

        this.sampleView = sampleView;

        // TODO: Optimize the following
        this.sampleHandler.addAttributeInfoSource(
            SAMPLE_ATTRIBUTE,
            (attribute) =>
                this.children
                    .map(this.getAttributeInfoFromView.bind(this))
                    .find((info) => info && info.name == attribute.specifier)
        );

        this.sampleHandler.addAttributeInfoSource(SAMPLE_NAME, (attribute) => ({
            name: "displayName",
            accessor: (sampleId) =>
                this.sampleView.sampleAccessor(sampleId).displayName,
            type: "nominal",
            scale: undefined,
        }));

        this.addInteractionEventListener(
            "contextmenu",
            this.handleContextMenu.bind(this)
        );

        this.addInteractionEventListener("mousemove", (coords, event) => {
            const sample = this._findSampleForMouseEvent(coords, event);
            if (sample) {
                const attribute =
                    (event.target &&
                        this.getAttributeInfoFromView(event.target)?.name) ||
                    undefined;
                const id = JSON.stringify([sample.id, attribute]);
                this.context.updateTooltip(id, (id) =>
                    Promise.resolve(this.sampleToTooltip(id))
                );
            }
        });
    }

    get sampleHandler() {
        return this.sampleView.sampleHandler;
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
        super.render(context, coords, {
            ...options,
            clipRect: this.sampleView._clipBySummary(coords),
        });
    }

    /**
     * @param {import("../../utils/layout/rectangle").default} coords
     *      Coordinates of the view
     * @param {import("../../utils/interactionEvent").default} event
     */
    _findSampleForMouseEvent(coords, event) {
        const sampleId = this.sampleView.getSampleIdAt(
            event.point.y - coords.y
        );

        return sampleId ? this.sampleView.sampleMap.get(sampleId) : undefined;
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
                    html` Attribute: <strong>${attribute.name}</strong> `,
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

        this.context.contextMenu({ items }, mouseEvent);
    }

    /**
     * @param {Sample[]} samples
     */
    _setSamples(samples) {
        if (this.children.length) {
            throw new Error("Children are already created!");
            // TODO: Check whether the attributes match and update the views and data accordingly
        }

        this._createViews();

        const flow = this.context.dataFlow;
        buildDataFlow(this, flow);
        // TODO: optimizeDataFlow(dataFlow);

        const dynamicSource =
            /** @type {import("../../data/sources/dynamicSource").default} */ (
                flow.findDataSourceByKey(this)
            );

        dynamicSource.visit((node) => node.initialize());

        /** @type {Promise<import("../../marks/mark").default>[]} */
        const promises = [];

        this.visit((view) => {
            if (view instanceof UnitView) {
                const mark = view.mark;
                promises.push(mark.initializeGraphics().then((result) => mark));

                flow.addObserver((collector) => {
                    mark.initializeEncoders();
                    mark.initializeData(); // does faceting
                    mark.updateGraphicsData();
                }, view);
            }
        });

        Promise.allSettled(promises).then((results) => {
            for (const result of results) {
                if ("value" in result) {
                    result.value.finalizeGraphicsInitialization();
                } else if ("reason" in result) {
                    console.error(result.reason);
                }
            }
            // TODO: Ensure that the views are rendered after finalization:
            // this.context.animator.requestRender();
            // But also ensure that the cached batch is invalidated
        });

        dynamicSource.publishData(samples);
    }

    _createViews() {
        const addedChildViews = [
            createLabelViewSpec(),
            ...this._createAttributeViewSpecs(),
        ].map((spec) => this.addChildBySpec(spec));

        for (const view of addedChildViews) {
            if (view instanceof UnitView) {
                // TODO: Move initialization to viewUtils
                view.resolve("scale");
                view.resolve("axis");
            }
        }
    }

    /**
     *
     * @param {string} attributeName
     */
    _getAttributeDef(attributeName) {
        return this.sampleView.spec.samples?.attributes?.[attributeName];
    }

    _getAttributeNames() {
        return this._cache("attributeNames", () => {
            const samples = this.sampleView.getAllSamples();

            // Find all attributes
            const attributes = samples
                .flatMap((sample) => Object.keys(sample.attributes))
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
        const samples = this.sampleView.getAllSamples();

        return this._getAttributeNames().map((attributeName) => {
            const attributeDef = this._getAttributeDef(attributeName);

            // Ensure that attributes have a type
            let fieldType = attributeDef ? attributeDef.type : undefined;
            if (!fieldType) {
                switch (
                    inferType(
                        samples.map(
                            (sample) => sample.attributes[attributeName]
                        )
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
                type: fieldType,
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

            const sampleAccessor = this.sampleView.sampleAccessor;

            /** @param {string} sampleId */
            const accessor = (sampleId) => {
                const sample = sampleAccessor(sampleId);
                return sample.attributes[attribute];
            };

            return {
                name: attribute,
                accessor,
                type: resolution.type,
                scale: resolution.getScale(),
                title: attribute,
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
                callback: () => dispatch(Actions.sortBy({ type: SAMPLE_NAME })),
            },
            {
                label: `Sample: ${sample.displayName}`,
                type: "header",
            },
            {
                label: "Retain",
                callback: () => alert("TODO"),
            },
            {
                label: "Remove",
                callback: () => alert("TODO"),
            },
        ];
    }

    /**
     *
     * @param {string} sampleAndAttribute
     */
    sampleToTooltip(sampleAndAttribute) {
        /** @type {string[]} */
        const [sampleId, attribute] = JSON.parse(sampleAndAttribute);

        const sample = this.sampleView.sampleMap.get(sampleId);

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
            <div class="title">
                <strong>${sample.displayName || sample.id}</strong>
            </div>
            ${table}
        `;
    }

    /**
     * @param {string} channel
     * @param {import("../containerView").ResolutionTarget} resolutionType
     * @returns {import("../../spec/view").ResolutionBehavior}
     */
    getDefaultResolution(channel, resolutionType) {
        return "independent";
    }

    /**
     * Parses a search field input into an action (if applicable) and
     * dispatches it.
     *
     * TODO: Should return a list of candidate actions that could be shown
     * in a dropdown as the user types something.
     *
     * @param {string} command
     * @returns {boolean} true of an action was dispatched
     */
    handleVerboseCommand(command) {
        // TODO: Provide an easier access to the attribute data
        for (const name of this._getAttributeNames()) {
            const info = this.getAttributeInfo(name);
            if (info.type == ORDINAL || info.type == NOMINAL) {
                const sample = this.sampleView._samples.find(
                    (sample) => sample.attributes[info.name] == command
                );

                if (sample) {
                    this.sampleHandler.dispatch(
                        Actions.filterByNominal(
                            { type: SAMPLE_ATTRIBUTE, specifier: name },
                            "retain",
                            [command]
                        )
                    );
                    return true;
                }
            }
        }
        return false;
    }
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
            type: "rect",
        },
        encoding: {
            facetIndex: { field: "indexNumber", type: "nominal" },
            color: {
                field,
                type: attributeDef.type,
                scale: attributeDef.scale,
            },
        },
    };

    if (attributeDef.barScale && attributeDef.type == FieldType.QUANTITATIVE) {
        attributeSpec.encoding.x = {
            field: `attributes["${attributeName}"]`,
            type: attributeDef.type,
            scale: attributeDef.barScale,
            axis: null,
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
            size: 11,
            flushY: false,
        },
        encoding: {
            facetIndex: { field: "indexNumber", type: "nominal" },
            x: { value: 0 },
            x2: { value: 1 },
            y: { value: 0 },
            y2: { value: 1 },
            text: { field: "displayName", type: "nominal" },
        },
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
