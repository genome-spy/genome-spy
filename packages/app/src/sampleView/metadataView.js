import { html } from "lit";
import { classMap } from "lit/directives/class-map.js";

import { inferType } from "vega-loader";

import ConcatView from "@genome-spy/core/view/concatView.js";
import UnitView from "@genome-spy/core/view/unitView.js";
import generateAttributeContextMenu from "./attributeContextMenu.js";
import formatObject from "@genome-spy/core/utils/formatObject.js";
import { buildDataFlow } from "@genome-spy/core/view/flowBuilder.js";
import { NOMINAL, ORDINAL } from "@genome-spy/core/view/scaleResolution.js";
import { easeQuadInOut } from "d3-ease";
import { peek } from "@genome-spy/core/utils/arrayUtils.js";
import { ActionCreators } from "redux-undo";
import { contextMenu, DIVIDER } from "../utils/ui/contextMenu.js";
import { checkForDuplicateScaleNames } from "@genome-spy/core/view/viewUtils.js";

// TODO: Move to a more generic place
/** @type {Record<string, import("@genome-spy/core/spec/channel.js").Type>} */
const FieldType = {
    NOMINAL: "nominal",
    ORDINAL: "ordinal",
    QUANTITATIVE: "quantitative",
};

const SAMPLE_ATTRIBUTE = "SAMPLE_ATTRIBUTE";
const SAMPLE_NAME = "SAMPLE_NAME";

const attributeViewRegex = /^attribute-(.*)$/;

/**
 * This special-purpose class takes care of rendering sample labels and metadata.
 */
export class MetadataView extends ConcatView {
    /**
     * @typedef {import("@genome-spy/core/view/view.js").default} View
     */

    /**
     * @type {import("./sampleView.js").default}
     */
    #sampleView;

    /**
     * @param {import("./sampleView.js").default} sampleView
     * @param {import("@genome-spy/core/view/containerView.js").default} dataParent
     */
    constructor(sampleView, dataParent) {
        super(
            {
                title: "Sample metadata",
                data: { name: null },
                hconcat: [], // Contents are added dynamically
                spacing: sampleView.spec.samples.attributeSpacing ?? 1,
                padding: { right: 10 },
                resolve: {
                    scale: { default: "independent" },
                    axis: { default: "independent" },
                },
            },
            sampleView.context,
            sampleView,
            dataParent,
            "sample-metadata"
        );

        this.#sampleView = sampleView;

        this._attributeHighlighState = {
            /** Current opacity of attributes that are NOT hovered */
            backgroundOpacity: 1.0,
            /** @type {string} */
            currentAttribute: undefined,
            abortController: new AbortController(),
        };

        // TODO: Optimize the following
        this.#sampleView.compositeAttributeInfoSource.addAttributeInfoSource(
            SAMPLE_ATTRIBUTE,
            (attribute) =>
                this.children
                    .map(this.#getAttributeInfoFromView.bind(this))
                    .find((info) => info && info.name == attribute.specifier)
        );

        this.#sampleView.compositeAttributeInfoSource.addAttributeInfoSource(
            SAMPLE_NAME,
            (attribute) => SAMPLE_NAME_ATTRIBUTE_INFO
        );

        this.addInteractionEventListener(
            "contextmenu",
            this.handleContextMenu.bind(this)
        );

        this.addInteractionEventListener("mousemove", (coords, event) => {
            const view = event.target;
            const sample = this.#sampleView.findSampleForMouseEvent(
                coords,
                event
            );
            const attribute =
                (view && this.#getAttributeInfoFromView(view)?.name) ||
                undefined;

            if (sample) {
                const id = JSON.stringify([sample.id, attribute]);
                this.context.updateTooltip(id, (id) =>
                    Promise.resolve(this.#sampleToTooltip(id))
                );
            }

            this._handleAttributeHighlight(attribute);
        });

        // TODO: Implement "mouseleave" event. Let's hack for now...
        peek([
            ...this.#sampleView.getLayoutAncestors(),
        ]).addInteractionEventListener("mousemove", (coords, event) => {
            if (!this._attributeHighlighState.currentAttribute) {
                return;
            }
            if (event.target) {
                for (const view of event.target.getLayoutAncestors()) {
                    if (view == this) {
                        return;
                    }
                }
            }

            this._handleAttributeHighlight(undefined);
        });
    }

    /**
     * @returns {import("@genome-spy/core/spec/channel.js").Encoding}
     */
    getEncoding() {
        // Block all inheritance
        return {};
    }

    /**
     * @type {import("@genome-spy/core/types/rendering.js").RenderMethod}
     */
    render(context, coords, options = {}) {
        if (!this.isConfiguredVisible()) {
            return;
        }

        super.render(context, coords, {
            ...options,
            clipRect: this.#sampleView.locationManager.clipBySummary(coords),
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
        return this.#sampleView.sampleHierarchy.sampleData?.entities[sampleId];
    }

    /**
     * @param {string} attribute
     */
    #getAttributeOpacity(attribute) {
        const state = this._attributeHighlighState;
        return attribute == state.currentAttribute
            ? 1.0
            : state.backgroundOpacity;
    }

    /**
     * @param {import("@genome-spy/core/view/layout/rectangle.js").default} coords
     *      Coordinates of the view
     * @param {import("@genome-spy/core/utils/interactionEvent.js").default} event
     */
    handleContextMenu(coords, event) {
        const mouseEvent = /** @type {MouseEvent} */ (event.uiEvent);

        const sample = this.#sampleView.findSampleForMouseEvent(coords, event);

        if (!sample) {
            mouseEvent.preventDefault();
            return;
        }

        /** @type {import("../utils/ui/contextMenu.js").MenuItem[]} */
        const items = [this.#sampleView.makePeekMenuItem(), DIVIDER];

        const attributeInfo = this.#getAttributeInfoFromView(event.target);
        if (attributeInfo) {
            const attributeValue = sample.attributes[attributeInfo.name];
            items.push(
                ...generateAttributeContextMenu(
                    html`Attribute: <strong>${attributeInfo.name}</strong>`,
                    attributeInfo,
                    attributeValue,
                    this.#sampleView
                )
            );
        } else {
            //items.push(...this.generateSampleContextMenu(sample, dispatch));
            items.push(
                ...generateAttributeContextMenu(
                    html`Sample: <strong>${sample.displayName}</strong>`,
                    SAMPLE_NAME_ATTRIBUTE_INFO,
                    sample.id,
                    this.#sampleView
                )
            );
        }

        contextMenu({ items }, mouseEvent);
    }

    /**
     * TODO: Attach this to state observer
     *
     * @param {import("./sampleState.js").Sample[]} samples
     */
    setSamples(samples) {
        if (this.childCount) {
            throw new Error("Children are already created!");
            // TODO: Check whether the attributes match and update the views and data accordingly
        }

        this._createViews();

        const flow = this.context.dataFlow;
        buildDataFlow(this, flow);
        // TODO: optimizeDataFlow(dataFlow);

        const dynamicSource =
            /** @type {import("@genome-spy/core/data/sources/namedSource.js").default} */ (
                flow.findDataSourceByKey(this)
            );

        dynamicSource.visit((node) => node.initialize());

        /** @type {Promise<import("@genome-spy/core/marks/mark.js").default>[]} */
        const promises = [];

        this.visit((view) => {
            if (view instanceof UnitView) {
                const mark = view.mark;
                mark.initializeEncoders();
                promises.push(mark.initializeGraphics().then((result) => mark));

                flow.addObserver((collector) => {
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

        dynamicSource.updateDynamicData(samples);

        // A terrible hack to initialize data sources.
        // TODO: Come up with a clean solution.
        this.visit((view) => {
            if (view.name.startsWith("title")) {
                flow.findDataSourceByKey(view).load();
            }
        });
    }

    _createViews() {
        /** @type {View[]} */
        const views = [];

        views.push(
            this.context.createView(
                createLabelViewSpec(this.#sampleView.spec.samples),
                this,
                this
            )
        );

        for (const attribute of this.getAttributeNames()) {
            const view = this.context.createView(
                this.#createAttributeViewSpec(attribute),
                this,
                this
            );
            view.opacityFunction = (parentOpacity) =>
                parentOpacity * this.#getAttributeOpacity(attribute);

            views.push(view);
        }

        this.setChildren(views);

        // This is a hack to ensure that the title views are not clipped.
        // TODO: Clipping should only be applied to the unit views inside GridChilds
        for (const v of this.getDescendants()) {
            if (v instanceof UnitView && v.name.startsWith("title")) {
                if (typeof v.spec.mark !== "string") {
                    v.spec.mark.clip = "never";
                }
            }
        }

        checkForDuplicateScaleNames(this);
    }

    /**
     *
     * @param {string} attributeName
     */
    #getAttributeDef(attributeName) {
        return this.#sampleView.spec.samples?.attributes?.[attributeName];
    }

    getAttributeNames() {
        // TODO: Use reselect
        return this._cache("attributeNames", () => {
            const samples = this.#sampleView.getSamples();

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
    #createAttributeViewSpec(attribute) {
        const attributeDef = this.#getAttributeDef(attribute);

        // Ensure that attributes have a type
        let fieldType = attributeDef ? attributeDef.type : undefined;
        if (!fieldType) {
            const samples = this.#sampleView.getSamples();
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

        return createAttributeSpec(
            attribute,
            {
                ...(attributeDef || {}),
                type: fieldType,
            },
            this.#sampleView.spec.samples
        );
    }

    /**
     * Returns the view that displays the given attribute.
     *
     * @param {string} attribute
     */
    #findViewForAttribute(attribute) {
        // This is a bit fragile.. +1 is for skipping the sample label
        return this.children[this.getAttributeNames().indexOf(attribute) + 1];
    }

    /**
     * @param {View} view
     * @returns {import("./types.js").AttributeInfo}
     */
    #getAttributeInfoFromView(view) {
        const nameMatch = view?.name.match(attributeViewRegex);
        if (nameMatch) {
            // Foolhardily assume that color is always used for encoding.
            const resolution = view.getScaleResolution("color");

            const attributeName = nameMatch[1];

            return {
                name: attributeName,
                attribute: { type: SAMPLE_ATTRIBUTE, specifier: attributeName },
                accessor: (sampleId, sampleHierarchy) =>
                    sampleHierarchy.sampleData.entities[sampleId].attributes[
                        attributeName
                    ],
                type: resolution.type,
                scale: resolution.getScale(),
                title: html`<em class="attribute">${attributeName}</em>`,
            };
        }
    }

    /**
     *
     * @param {string} attribute
     */
    getAttributeInfo(attribute) {
        return this.#getAttributeInfoFromView(
            this.#findViewForAttribute(attribute)
        );
    }

    /**
     *
     * @param {string} sampleAndAttribute
     */
    #sampleToTooltip(sampleAndAttribute) {
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
     * @param {import("@genome-spy/core/spec/view.js").ResolutionTarget} resolutionType
     * @returns {import("@genome-spy/core/spec/view.js").ResolutionBehavior}
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
        const searchKey = command;

        for (const name of this.getAttributeNames()) {
            const info = this.getAttributeInfo(name);
            if (info.type == ORDINAL || info.type == NOMINAL) {
                const sample = this.#sampleView
                    .getSamples()
                    .find(
                        (sample) => sample.attributes[info.name] == searchKey
                    );

                if (sample) {
                    const action = this.#sampleView.actions.filterByNominal({
                        attribute: {
                            type: SAMPLE_ATTRIBUTE,
                            specifier: name,
                        },
                        values: [searchKey],
                    });

                    const lastAction =
                        this.#sampleView.provenance.getPresentState()
                            .lastAction;
                    // Undo the previous action if we are filtering by the same nominal attribute
                    const shouldUndo =
                        this.#sampleView.actions.filterByNominal.match(
                            lastAction
                        ) &&
                        !lastAction.payload.remove &&
                        lastAction.payload.attribute.type == SAMPLE_ATTRIBUTE &&
                        lastAction.payload.attribute.specifier == name &&
                        lastAction.payload.values.length == 1;

                    this.#sampleView.provenance.storeHelper.dispatch(
                        shouldUndo ? [ActionCreators.undo(), action] : action
                    );

                    return true;
                }
            }
        }
        return false;
    }

    isPickingSupported() {
        return false;
    }
}

/**
 * @param {string} attributeName
 * @param {import("@genome-spy/core/spec/sampleView.js").SampleAttributeDef} attributeDef
 * @param {import("@genome-spy/core/spec/sampleView.js").SampleDef} sampleDef
 */
function createAttributeSpec(attributeName, attributeDef, sampleDef) {
    const field = `attributes["${attributeName}"]`;

    /** @type {import("@genome-spy/core/spec/view.js").UnitSpec} */
    const attributeSpec = {
        name: `attribute-${attributeName}`,
        title: {
            text: attributeName,
            orient: "bottom",
            align: "right",
            baseline: "middle",
            offset: 5,
            angle: -90 + (sampleDef.attributeLabelAngle ?? 0),
            dy: -0.5,

            font: sampleDef.attributeLabelFont,
            fontSize: sampleDef.attributeLabelFontSize ?? 11,
            fontStyle: sampleDef.attributeLabelFontStyle,
            fontWeight: sampleDef.attributeLabelFontWeight,
        },
        visible: attributeDef.visible ?? true,
        width: attributeDef.width ?? sampleDef.attributeSize ?? 10,
        transform: [{ type: "filter", expr: `datum.${field} != null` }],
        mark: {
            type: "rect",
            xOffset: -0.5,
        },
        encoding: {
            facetIndex: { field: "indexNumber" },
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

/**
 *
 * @param {import("@genome-spy/core/spec/sampleView.js").SampleDef} sampleDef
 */
function createLabelViewSpec(sampleDef) {
    // TODO: Support styling: https://vega.github.io/vega-lite/docs/header.html#labels

    /** @type {import("@genome-spy/core/spec/view.js").UnitSpec} */
    const titleSpec = {
        name: "metadata-sample-name",
        title: {
            text: sampleDef.labelTitleText ?? "Sample name",
            orient: "bottom",
            anchor: "start",
            offset: 5,
            font: sampleDef.attributeLabelFont,
            fontSize: sampleDef.attributeLabelFontSize ?? 11,
            fontStyle: sampleDef.attributeLabelFontStyle,
            fontWeight: sampleDef.attributeLabelFontWeight,
        },
        width: sampleDef.labelLength ?? 140,
        mark: {
            type: "text",
            baseline: "middle",
            font: sampleDef.labelFont,
            size: sampleDef.labelFontSize ?? 11,
            fontStyle: sampleDef.labelFontStyle,
            fontWeight: sampleDef.labelFontWeight,
            align: sampleDef.labelAlign ?? "left",
            flushY: false,
        },
        encoding: {
            facetIndex: { field: "indexNumber" },
            x: { value: 0 },
            x2: { value: 1 },
            y: { value: 0 },
            y2: { value: 1 },
            text: { field: "displayName" },
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

/** @type {import("./types.js").AttributeInfo} */
const SAMPLE_NAME_ATTRIBUTE_INFO = Object.freeze({
    name: "sample",
    attribute: { type: SAMPLE_NAME },
    accessor: (/** @type {string} */ sampleId) => sampleId,
    type: "identifier",
    scale: undefined,
});
