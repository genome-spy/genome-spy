import { html } from "lit";
import { classMap } from "lit/directives/class-map.js";

import ConcatView from "@genome-spy/core/view/concatView.js";
import UnitView from "@genome-spy/core/view/unitView.js";
import generateAttributeContextMenu from "../attributeContextMenu.js";
import formatObject from "@genome-spy/core/utils/formatObject.js";
import {
    NOMINAL,
    ORDINAL,
    reconfigureScales,
} from "@genome-spy/core/view/scaleResolution.js";
import { easeQuadInOut } from "d3-ease";
import { peek } from "@genome-spy/core/utils/arrayUtils.js";
import { ActionCreators } from "redux-undo";
import { contextMenu, DIVIDER } from "../../utils/ui/contextMenu.js";
import {
    checkForDuplicateScaleNames,
    finalizeSubtreeGraphics,
    initializeSubtree,
} from "@genome-spy/core/view/viewUtils.js";
import { subscribeTo } from "../../state/subscribeTo.js";
import { buildPathTree, METADATA_PATH_SEPARATOR } from "./metadataUtils.js";
import { splitPath } from "../../utils/escapeSeparator.js";

const SAMPLE_ATTRIBUTE = "SAMPLE_ATTRIBUTE";

const attributeViewRegex = /^attribute-(.*)$/;

/**
 * This special-purpose class takes care of rendering sample labels and metadata.
 */
export class MetadataView extends ConcatView {
    /**
     * @typedef {import("@genome-spy/core/view/view.js").default} View
     */

    /** @type {import("../sampleView.js").default} */
    #sampleView;

    /**
     * TODO: Don't use a local copy. Select from state directly.
     * @type {import("../state/sampleState.js").Metadata}
     */
    #metadata;

    /**
     * Lookup table: find attribute views by attribute name
     * @type {Map<string, UnitView>}
     */
    #attributeViews = new Map();

    /** @type {() => void} */
    #unsubscribe = () => undefined;

    #metadataGeneration = 0;

    /** @type {WeakMap<View, string>} */
    #viewToAttribute = new WeakMap();

    /**
     * @type {import("@genome-spy/core/view/view.js").default}
     */
    #highlightTarget;

    /**
     * @type {(coords: import("@genome-spy/core/view/layout/rectangle.js").default, event: import("@genome-spy/core/utils/interactionEvent.js").default) => void}
     */
    #highlightTargetListener;

    /**
     * @param {import("../sampleView.js").default} sampleView
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

        this.#unsubscribe = subscribeTo(
            this.#sampleView.provenance.store,
            (state) => state.provenance.present.sampleView.sampleMetadata,
            (sampleMetadata) => {
                this.#setMetadata(sampleMetadata);
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
        this.#highlightTarget = peek([
            ...this.#sampleView.getLayoutAncestors(),
        ]);
        this.#highlightTargetListener = (coords, event) => {
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
        };
        this.#highlightTarget.addInteractionEventListener(
            "mousemove",
            this.#highlightTargetListener
        );
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

        /** @type {import("../../utils/ui/contextMenu.js").MenuItem[]} */
        const items = [this.#sampleView.makePeekMenuItem(), DIVIDER];

        const attributeInfo = this.#getAttributeInfoForView(event.target);
        if (attributeInfo) {
            const name = /** @type {string} */ (
                attributeInfo.attribute.specifier
            );
            const attributeValue = metadatum?.[name];
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
     * @param {import("../state/sampleState.js").SampleMetadata} sampleMetadata
     */
    #setMetadata(sampleMetadata) {
        this.#metadata = sampleMetadata.entities;

        const flow = this.context.dataFlow;
        flow.removeHost(this);

        const metadataGeneration = ++this.#metadataGeneration;

        this.#createViews();

        const { dataSources, graphicsPromises } = initializeSubtree(this, flow);

        const dynamicSource =
            /** @type {import("@genome-spy/core/data/sources/namedSource.js").default} */ (
                flow.findDataSourceByKey(this)
            );

        if (!dynamicSource) {
            throw new Error("Cannot find metadata data source!");
        }

        finalizeSubtreeGraphics(
            graphicsPromises,
            () => metadataGeneration === this.#metadataGeneration
        );

        const sampleEntities =
            this.#sampleView.sampleHierarchy.sampleData.entities;

        const metadataTable = Object.entries(sampleMetadata.entities).map(
            ([sample, metadatum]) => ({
                sample,
                indexNumber: sampleEntities[sample]?.indexNumber,
                ...metadatum,
            })
        );

        if (metadataTable.findIndex((d) => d.indexNumber === undefined) >= 0) {
            console.warn("Some metadata entries do not match any sample data");
        }

        dynamicSource.updateDynamicData(metadataTable);

        for (const dataSource of dataSources) {
            if (dataSource !== dynamicSource) {
                dataSource.load();
            }
        }
        reconfigureScales(this); // TODO: Should happen automatically

        this.context.requestLayoutReflow();
    }

    #createViews() {
        this.setChildren([]);
        this.#attributeViews.clear();

        // TODO: If the spec specifies a separator (in this.#sampleView.spec.samples.attributeGroupSeparator),
        // convert them to METADATA_PATH_SEPARATOR

        const nestedAttributes = buildPathTree(
            this.getAttributeNames(),
            METADATA_PATH_SEPARATOR
        );

        const attributeDefs =
            this.#sampleView.sampleHierarchy.sampleMetadata.attributeDefs;

        /**
         *
         * @param {import("./metadataUtils.js").PathTreeNode} attributeNode
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

                    // An escaped path string that identifies an attribute
                    const attributeName = node.path;

                    const attributeDef = {
                        ...inheritedAttributeDef,
                        title: node.part,
                        ...(attributeDefs?.[attributeName] ?? {}),
                    };

                    const view = new UnitView(
                        createAttributeSpec(
                            attributeName,
                            attributeDef,
                            this.#sampleView.spec.samples
                        ),
                        this.context,
                        container,
                        container,
                        `attribute-${attributeName}`
                    );
                    view.opacityFunction = (parentOpacity) =>
                        parentOpacity *
                        this.#getAttributeOpacity(attributeName);

                    container.appendChild(view);
                    this.#attributeViews.set(attributeName, view);
                    this.#viewToAttribute.set(view, attributeName);
                } else {
                    const attributeDef = attributeDefs?.[node.path] ?? {};

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
                                // TODO: scale could be shared within groups
                                scale: { default: "independent" },
                                axis: { default: "independent" },
                            },
                        },
                        this.context,
                        container,
                        container,
                        `attributeGroup-${node.path}`
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
     * @returns {import("../types.js").AttributeInfo}
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
                sampleHierarchy.sampleMetadata.entities[sampleId]?.[
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
                                <th>${formatAttributeName(key)}</th>
                                <td>${formatObject(value)}</td>
                                <td
                                    class="color"
                                    style="background-color: ${getColor(
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
                    this.#sampleView.dispatchAttributeAction(action);

                    return true;
                }
            }
        }
        return false;
    }

    isPickingSupported() {
        return false;
    }

    /**
     * @override
     */
    dispose() {
        super.dispose();
        this.#unsubscribe();
        this.#highlightTarget.removeInteractionEventListener(
            "mousemove",
            this.#highlightTargetListener
        );
        this._attributeHighlighState.abortController.abort();
    }
}

/**
 * @param {string} attributeName
 * @param {import("@genome-spy/core/spec/sampleView.js").SampleAttributeDef} attributeDef
 * @param {import("@genome-spy/core/spec/sampleView.js").SampleDef} sampleDef
 */
function createAttributeSpec(attributeName, attributeDef, sampleDef) {
    if (!attributeDef) {
        throw new Error("No attribute definition for " + attributeName);
    }

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

    if (attributeDef.barScale && attributeDef.type == "quantitative") {
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
 * Returns a Lit TemplateResult representing the attribute name, formatted for display.
 * Path segments are separated by stylized slashes.
 *
 * @param {import("../state/payloadTypes.js").AttributeName} attributeName
 */
function formatAttributeName(attributeName) {
    const parts = splitPath(attributeName, METADATA_PATH_SEPARATOR);
    return html`${parts.map(
        (part, index) =>
            html`${index > 0
                ? html` <span style="color: gray;">&rsaquo;</span> `
                : ""}${part}`
    )}`;
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
