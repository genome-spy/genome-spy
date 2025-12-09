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
import { subscribeTo } from "../state/subscribeTo.js";

// TODO: Move to a more generic place
/** @type {Record<string, import("@genome-spy/core/spec/channel.js").Type>} */
const FieldType = {
    NOMINAL: "nominal",
    ORDINAL: "ordinal",
    QUANTITATIVE: "quantitative",
};

const SAMPLE_ATTRIBUTE = "SAMPLE_ATTRIBUTE";

const attributeViewRegex = /^attribute-(.*)$/;

/**
 * This special-purpose class takes care of rendering sample labels and metadata.
 */
export class MetadataView extends ConcatView {
    /**
     * @typedef {import("@genome-spy/core/view/view.js").default} View
     */

    /** @type {import("./sampleView.js").default} */
    #sampleView;

    /**
     * TODO: Don't use a local copy. Select from state directly.
     * @type {import("./sampleState.js").Metadata}
     */
    #metadata;

    /**
     * Lookup table: find attribute views by attribute name
     * @type {Map<string, UnitView>}
     */
    #attributeViews = new Map();

    /** @type {WeakMap<View, string>} */
    #viewToAttribute = new WeakMap();

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
                padding: { right: 10 }, // TODO: Configurable
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

        this.#sampleView.compositeAttributeInfoSource.addAttributeInfoSource(
            SAMPLE_ATTRIBUTE,
            (attribute) =>
                this.getAttributeInfo(
                    /** @type {string} */ (attribute.specifier)
                )
        );

        subscribeTo(
            this.#sampleView.provenance.store,
            (state) => state.provenance.present.sampleView.sampleMetadata,
            (sampleMetadata) => {
                this.setMetadata(sampleMetadata);
            }
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
            const attributeName = /** @type {string} */ (
                this.#getAttributeInfoForView(view)?.attribute.specifier
            );

            if (sample) {
                const id = JSON.stringify([sample.id, attributeName]);
                this.context.updateTooltip(id, (id) => {
                    const [sampleId, attribute] = JSON.parse(id);
                    return Promise.resolve(
                        this.#sampleToTooltip(sampleId, attribute)
                    );
                });
            }

            this.#handleAttributeHighlight(attributeName);
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

            this.#handleAttributeHighlight(undefined);
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
    #handleAttributeHighlight(attribute) {
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
        const sample = this.#sampleView.findSampleForMouseEvent(coords, event);

        if (!sample) {
            event.mouseEvent.preventDefault();
            return;
        }

        const metadatum =
            this.#sampleView.sampleHierarchy.sampleMetadata.entities[sample.id];

        /** @type {import("../utils/ui/contextMenu.js").MenuItem[]} */
        const items = [this.#sampleView.makePeekMenuItem(), DIVIDER];

        const attributeInfo = this.#getAttributeInfoForView(event.target);
        if (attributeInfo) {
            const name = /** @type {string} */ (
                attributeInfo.attribute.specifier
            );
            const attributeValue = metadatum[name];
            items.push(
                ...generateAttributeContextMenu(
                    html`Attribute: <strong>${name}</strong>`,
                    attributeInfo,
                    attributeValue,
                    this.#sampleView
                )
            );
        }

        contextMenu({ items }, event.mouseEvent);
    }

    /**
     * @param {{entities: import("./sampleState.js").Metadata, attributeNames: string[]}} metadata
     */
    setMetadata({ entities, attributeNames }) {
        this.#metadata = entities;

        const flow = this.context.dataFlow;

        // Fugly hack. TODO: Support tearing down the data flow
        //dynamicSource.children = [];

        this.#createViews();

        buildDataFlow(this, flow);

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

        const sampleEntities =
            this.#sampleView.sampleHierarchy.sampleData.entities;

        const metadataTable = Object.entries(entities).map(
            ([sample, metadatum]) => ({
                sample,
                indexNumber: sampleEntities[sample]?.indexNumber,
                ...metadatum,
            })
        );

        if (metadataTable.findIndex((d) => d.indexNumber === undefined) >= 0) {
            console.warn("Some metadata entries do not match any sample data");
        }

        // A terrible hack to initialize data sources.
        // TODO: Come up with a clean solution.
        this.visit((view) => {
            if (view.name.startsWith("title")) {
                flow.findDataSourceByKey(view).load();
            }
        });

        dynamicSource.updateDynamicData(metadataTable);
        this.context.requestLayoutReflow();
    }

    #createViews() {
        this.setChildren([]);
        this.#attributeViews.clear();

        const nestedAttributes = getNestedAttributes(
            this.getAttributeNames(),
            this.#sampleView.spec.samples.attributeGroupSeparator
        );

        /**
         * TODO: Import to state
         * @param {string} attributeName
         */
        const getAttributeDef = (attributeName) =>
            this.#sampleView.spec.samples?.attributes?.[attributeName];

        /**
         *
         * @param {AttributeNode} attributeNode
         * @param {ConcatView} container
         * @param {import("@genome-spy/core/spec/sampleView.js").SampleAttributeDef} inheritedAttributeDef
         */
        const createAttributeViews = (
            attributeNode,
            container,
            inheritedAttributeDef
        ) => {
            for (const node of attributeNode.children.values()) {
                if (node.children.size == 0) {
                    // It's a leaf

                    const attribute = node.attribute;

                    const attributeDef = {
                        ...inheritedAttributeDef,
                        title: node.part,
                        ...getAttributeDef(attribute),
                    };

                    const view = new UnitView(
                        this.#createAttributeViewSpec(attribute, attributeDef),
                        this.context,
                        container,
                        container,
                        `attribute-${attribute}`
                    );
                    view.opacityFunction = (parentOpacity) =>
                        parentOpacity * this.#getAttributeOpacity(attribute);

                    container.appendChild(view);
                    this.#attributeViews.set(attribute, view);
                    this.#viewToAttribute.set(view, attribute);
                } else {
                    const attributeDef = getAttributeDef(node.attribute) ?? {};

                    const view = new ConcatView(
                        {
                            hconcat: [],
                            configurableVisibility: true,
                            title: attributeDef.title ?? node.part,
                            visible: attributeDef.visible ?? true,
                            spacing:
                                this.#sampleView.spec.samples
                                    .attributeSpacing ?? 1,
                            resolve: {
                                scale: { default: "independent" },
                                axis: { default: "independent" },
                            },
                        },
                        this.context,
                        container,
                        container,
                        `attributeGroup-${node.attribute}`
                    );
                    container.appendChild(view);

                    createAttributeViews(node, view, {
                        ...inheritedAttributeDef,
                        ...attributeDef,
                        visible: undefined,
                        title: undefined,
                    });
                }
            }
        };

        createAttributeViews(nestedAttributes, this, {});

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

    getAttributeNames() {
        return this.#sampleView.sampleHierarchy.sampleMetadata.attributeNames;
    }

    /**
     * Builds a view spec for attribute.
     *
     * @param {string} attribute
     * @param {import("@genome-spy/core/spec/sampleView.js").SampleAttributeDef} attributeDef
     */
    #createAttributeViewSpec(attribute, attributeDef) {
        let fieldType =
            attributeDef.type ??
            inferFieldType(
                Object.values(
                    this.#sampleView.sampleHierarchy.sampleMetadata.entities
                ).map((d) => d[attribute])
            );

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
     * @param {View} view
     */
    #getAttributeInfoForView(view) {
        const attributeName = this.#viewToAttribute.get(view);
        if (!attributeName) {
            return;
        }
        return this.getAttributeInfo(attributeName);
    }

    /**
     * @param {string} attributeName
     * @returns {import("./types.js").AttributeInfo}
     */
    getAttributeInfo(attributeName) {
        const view = this.#attributeViews.get(attributeName);
        if (!view) {
            throw new Error("No such attribute: " + attributeName);
        }

        // Assume that color is always used for encoding.
        const resolution = view.getScaleResolution("color");

        return {
            name: attributeName,
            attribute: { type: SAMPLE_ATTRIBUTE, specifier: attributeName },
            accessor: (sampleId, sampleHierarchy) =>
                sampleHierarchy.sampleMetadata.entities[sampleId][
                    attributeName
                ],
            type: resolution.type,
            scale: resolution.scale,
            title: html`<em class="attribute">${attributeName}</em>`,
        };
    }

    /**
     *
     * @param {string} sampleId
     * @param {string} attribute
     */
    #sampleToTooltip(sampleId, attribute) {
        const attributeViews = new Map(
            this.#attributeViews
                .values()
                .map((view) => [view.name.match(attributeViewRegex)[1], view])
        );

        /**
         * @param {string} attribute
         * @param {any} value
         */
        const getColor = (attribute, value) =>
            isDefined(value)
                ? this.getAttributeInfo(attribute).scale(value)
                : "transparent";

        const metadatum = this.#metadata[sampleId];

        const table = html`
            <table class="attributes">
                ${Object.entries(metadatum)
                    .filter(([key]) => attributeViews.get(key).isVisible())
                    .map(
                        ([key, value]) => html`
                            <tr
                                class=${classMap({ hovered: key == attribute })}
                            >
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

        // TODO: Show displayName instead
        return html`
            <div class="title">
                <strong>${sampleId}</strong>
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

        const metadata = Object.values(
            this.#sampleView.sampleHierarchy.sampleMetadata.entities
        );

        for (const name of this.getAttributeNames()) {
            const info = this.getAttributeInfo(name);
            if (info.type == ORDINAL || info.type == NOMINAL) {
                const found = !!metadata.find(
                    (d) =>
                        d[/** @type {string} */ (info.attribute.specifier)] ==
                        searchKey
                );

                if (found) {
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

                    const store = this.#sampleView.provenance.store;
                    if (shouldUndo) {
                        store.dispatch(ActionCreators.undo());
                    }
                    store.dispatch(action);

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
    const escapedField = `datum[${JSON.stringify(attributeName)}]`;

    /** @type {import("@genome-spy/core/spec/view.js").UnitSpec} */
    const attributeSpec = {
        name: `attribute-${attributeName}`,
        title: {
            text: attributeDef.title ?? attributeName,
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
        transform: [{ type: "filter", expr: `${escapedField} != null` }],
        mark: {
            type: "rect",
            xOffset: -0.5,
        },
        encoding: {
            facetIndex: { field: "indexNumber" },
            color: {
                field: attributeName,
                type: attributeDef.type,
                scale: attributeDef.scale,
            },
        },
        opacity: 1,
    };

    if (attributeDef.barScale && attributeDef.type == FieldType.QUANTITATIVE) {
        attributeSpec.encoding.x = {
            field: attributeName,
            type: attributeDef.type,
            scale: attributeDef.barScale,
            axis: null,
        };
    }

    return attributeSpec;
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

/**
 * @typedef {{attribute: string, part: string, children: Map<string, AttributeNode>}} AttributeNode
 */
/**
 * @param {string[]} attributeNames
 * @param {string} separator
 * @returns {AttributeNode}
 */
function getNestedAttributes(attributeNames, separator) {
    /** @type {(s: string) => string[]} */
    const split = separator ? (s) => s.split(separator) : (s) => [s];

    /** @type {Map<string, AttributeNode>} */
    const root = new Map();

    for (const attribute of attributeNames) {
        const parts = split(attribute);
        let current = root;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (!current.has(part)) {
                current.set(part, {
                    part,
                    attribute:
                        separator != null
                            ? parts.slice(0, i + 1).join(separator)
                            : part,
                    children: new Map(),
                });
            }
            current = current.get(part).children;
        }
    }

    return {
        part: "",
        attribute: "",
        children: root,
    };
}

/**
 *
 * @param {import("@genome-spy/core/utils/domainArray.js").scalar[]} values
 */
function inferFieldType(values) {
    switch (inferType(values)) {
        case "integer":
        case "number":
            return FieldType.QUANTITATIVE;
        default:
            return FieldType.NOMINAL;
    }
}
