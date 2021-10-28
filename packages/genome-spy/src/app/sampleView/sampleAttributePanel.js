import { html } from "lit";
import { classMap } from "lit/directives/class-map.js";

import { inferType } from "vega-loader";

import ConcatView from "../../view/concatView";
import UnitView from "../../view/unitView";
import generateAttributeContextMenu from "./attributeContextMenu";
import formatObject from "../../utils/formatObject";
import { buildDataFlow } from "../../view/flowBuilder";
import { NOMINAL, ORDINAL } from "../../view/scaleResolution";
import { resolveScalesAndAxes } from "../../view/viewUtils";
import { easeQuadInOut } from "d3-ease";
import { peek } from "../../utils/arrayUtils";

// TODO: Move to a more generic place
const FieldType = {
    NOMINAL: "nominal",
    ORDINAL: "ordinal",
    QUANTITATIVE: "quantitative",
};

const SAMPLE_ATTRIBUTE = "SAMPLE_ATTRIBUTE";
const SAMPLE_NAME = "SAMPLE_NAME";

const attributeViewRegex = /^attribute-(.*)$/;

/**
 * @typedef {import("./sampleView").Sample} Sample
 * @typedef {import("../../view/view").default} View
 */

/**
 * This special-purpose class takes care of rendering sample labels and metadata.
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
                resolve: {
                    scale: { default: "independent" },
                    axis: { default: "independent" },
                },
            },
            sampleView.context,
            // TODO: fix parent
            undefined,
            "sampleAttributes"
        );

        this.sampleView = sampleView;

        this._attributeHighlighState = {
            /** Current opacity of attributes that are NOT hovered */
            backgroundOpacity: 1.0,
            /** @type {string} */
            currentAttribute: undefined,
            abortController: new AbortController(),
        };

        // TODO: Optimize the following
        this.sampleView.compositeAttributeInfoSource.addAttributeInfoSource(
            SAMPLE_ATTRIBUTE,
            (attribute) =>
                this.children
                    .map(this.getAttributeInfoFromView.bind(this))
                    .find((info) => info && info.name == attribute.specifier)
        );

        this.sampleView.compositeAttributeInfoSource.addAttributeInfoSource(
            SAMPLE_NAME,
            (attribute) => ({
                name: "displayName",
                accessor: (sampleId) => this.getSample(sampleId).displayName,
                type: "nominal",
                scale: undefined,
            })
        );

        this.addInteractionEventListener(
            "contextmenu",
            this.handleContextMenu.bind(this)
        );

        this.addInteractionEventListener("mousemove", (coords, event) => {
            const view = event.target;
            const sample = this._findSampleForMouseEvent(coords, event);
            const attribute =
                (view && this.getAttributeInfoFromView(view)?.name) ||
                undefined;

            if (sample) {
                const id = JSON.stringify([sample.id, attribute]);
                this.context.updateTooltip(id, (id) =>
                    Promise.resolve(this.sampleToTooltip(id))
                );
            }

            this._handleAttributeHighlight(attribute);
        });

        // TODO: Implement "mouseleave" event. Let's hack for now...
        peek([...this.sampleView.getAncestors()]).addInteractionEventListener(
            "mousemove",
            (coords, event) => {
                if (!this._attributeHighlighState.currentAttribute) {
                    return;
                }
                for (const view of event.target.getAncestors()) {
                    if (view == this) {
                        return;
                    }
                }

                this._handleAttributeHighlight(undefined);
            }
        );
    }

    /**
     * @param {View} whoIsAsking
     * @returns {import("../../spec/channel").Encoding}
     */
    getEncoding(whoIsAsking) {
        // Block all inheritance
        return {};
    }

    /**
     * @param {import("../../view/renderingContext/viewRenderingContext").default} context
     * @param {import("../../utils/layout/rectangle").default} coords
     * @param {import("../../view/view").RenderingOptions} [options]
     */
    render(context, coords, options = {}) {
        super.render(context, coords, {
            ...options,
            clipRect: this.sampleView._clipBySummary(coords),
        });
    }

    /**
     * Dim attributes that are not hovered
     *
     * @param {string} attribute The hovered attribute
     */
    _handleAttributeHighlight(attribute) {
        const state = this._attributeHighlighState;

        if (attribute != state.currentAttribute) {
            // Cancel the previous transition
            state.abortController.abort();
            state.abortController = new AbortController();
            this.context.animator
                .transition({
                    from: state.backgroundOpacity,
                    onUpdate: (value) => {
                        state.backgroundOpacity = value;
                    },
                    easingFunction: easeQuadInOut,
                    signal: state.abortController.signal,
                    ...(attribute
                        ? {
                              to: 0.1,
                              duration: 1000,
                              delay: state.backgroundOpacity < 1.0 ? 0 : 500,
                          }
                        : {
                              to: 1.0,
                              duration: 200,
                              delay: 150,
                          }),
                })
                .catch((e) => {
                    // nop
                });

            // Ensure that the view is rendered, regardless of the transition.
            this.context.animator.requestRender();
        }

        state.currentAttribute = attribute;
    }

    /**
     * @param {string} sampleId
     */
    getSample(sampleId) {
        return this.sampleView.sampleHierarchy.sampleData?.entities[sampleId];
    }

    /**
     * @param {import("../../utils/layout/rectangle").default} coords
     *      Coordinates of the view
     * @param {import("../../utils/interactionEvent").default} event
     */
    _findSampleForMouseEvent(coords, event) {
        return this.sampleView.getSampleAt(event.point.y - coords.y);
    }

    /**
     * @param {string} attribute
     */
    _getAttributeOpacity(attribute) {
        const state = this._attributeHighlighState;
        return attribute == state.currentAttribute
            ? 1.0
            : state.backgroundOpacity;
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

        const dispatch = this.sampleView.provenance.getDispatcher();

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
                    this.sampleView
                )
            );
        } else {
            items.push(...this.generateSampleContextMenu(sample, dispatch));
        }

        this.context.contextMenu({ items }, mouseEvent);
    }

    /**
     * TODO: Attach this to state observer
     *
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
        this.addChildBySpec(createLabelViewSpec());

        for (const attribute of this._getAttributeNames()) {
            const view = this.addChildBySpec(
                this._createAttributeViewSpec(attribute)
            );
            view.opacityFunction = (parentOpacity) =>
                parentOpacity * this._getAttributeOpacity(attribute);
        }

        resolveScalesAndAxes(this);
    }

    /**
     *
     * @param {string} attributeName
     */
    _getAttributeDef(attributeName) {
        return this.sampleView.spec.samples?.attributes?.[attributeName];
    }

    _getAttributeNames() {
        // TODO: Use reselect
        return this._cache("attributeNames", () => {
            const samples = this.sampleView.getSamples();

            // Find all attributes
            const attributes = samples
                .flatMap((sample) => Object.keys(sample.attributes))
                .reduce(
                    (set, key) => set.add(/** @type {string} */ (key)),
                    /** @type {Set<string>} */ (new Set())
                );

            return [...attributes];
        });
    }

    /**
     * Builds a view spec for attribute.
     *
     * @param {string} attribute
     */
    _createAttributeViewSpec(attribute) {
        const attributeDef = this._getAttributeDef(attribute);

        // Ensure that attributes have a type
        let fieldType = attributeDef ? attributeDef.type : undefined;
        if (!fieldType) {
            const samples = this.sampleView.getSamples();
            switch (
                inferType(samples.map((sample) => sample.attributes[attribute]))
            ) {
                case "integer":
                case "number":
                    fieldType = FieldType.QUANTITATIVE;
                    break;
                default:
                    fieldType = FieldType.NOMINAL;
            }
        }

        return createAttributeSpec(attribute, {
            ...(attributeDef || {}),
            type: fieldType,
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
     * @returns {import("./types").AttributeInfo}
     */
    getAttributeInfoFromView(view) {
        const nameMatch = view.name.match(attributeViewRegex);
        if (nameMatch) {
            // Foolhardily assume that color is always used for encoding.
            const resolution = view.getScaleResolution("color");

            const attribute = nameMatch[1];

            return {
                name: attribute,
                accessor: (sampleId, sampleHierarchy) =>
                    sampleHierarchy.sampleData.entities[sampleId].attributes[
                        attribute
                    ],
                type: resolution.type,
                scale: resolution.getScale(),
                title: html`<em class="attribute">${attribute}</em>`,
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
                callback: () => dispatch(this.sampleView.actions.sortByName()),
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

        const sample = this.getSample(sampleId);

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
     * @param {import("../../view/containerView").ResolutionTarget} resolutionType
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
        //
    }

    _handleVerboseCommand() {
        const Actions = undefined;
        const command = "";

        // TODO: Provide an easier access to the attribute data
        const searchKey = command;

        for (const name of this._getAttributeNames()) {
            const info = this.getAttributeInfo(name);
            if (info.type == ORDINAL || info.type == NOMINAL) {
                const sample = this.sampleView._samples.find(
                    (sample) => sample.attributes[info.name] == searchKey
                );

                if (sample) {
                    /** @type {import("../provenance").Action[]} */
                    const actions = [];

                    // Undo the previous action if we are filtering by the same nominal attribute
                    const lastAction =
                        this.sampleView.provenance.currentNode?.action;
                    if (
                        lastAction &&
                        this.sampleView.actions.filterByNominal.match(
                            lastAction
                        ) &&
                        lastAction.payload?.action == "retain" &&
                        lastAction.payload?.attribute.type ==
                            SAMPLE_ATTRIBUTE &&
                        lastAction.payload?.attribute.specifier == name &&
                        lastAction.payload?.values.length == 1
                    ) {
                        actions.push(Actions.undo());
                    }

                    actions.push(
                        Actions.filterByNominal(
                            { type: SAMPLE_ATTRIBUTE, specifier: name },
                            "retain",
                            [searchKey]
                        )
                    );

                    this.sampleHandler.dispatchBatch(actions);
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

    /** @type {import("../../view/viewUtils").UnitSpec} */
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
        opacity: 1,
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

    /** @type {import("../../view/viewUtils").UnitSpec} */
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
