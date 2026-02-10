import { html } from "lit";
import { classMap } from "lit/directives/class-map.js";

import ConcatView from "@genome-spy/core/view/concatView.js";
import UnitView from "@genome-spy/core/view/unitView.js";
import generateAttributeContextMenu from "../attributeContextMenu.js";
import formatObject from "@genome-spy/core/utils/formatObject.js";
import { NOMINAL, ORDINAL } from "@genome-spy/core/scales/scaleResolution.js";
import { easeQuadInOut } from "d3-ease";
import { peek } from "@genome-spy/core/utils/arrayUtils.js";
import { ActionCreators } from "redux-undo";
import { contextMenu, DIVIDER } from "../../utils/ui/contextMenu.js";
import { appendPlotMenuItems } from "../plotMenuItems.js";
import {
    checkForDuplicateScaleNames,
    finalizeSubtreeGraphics,
} from "@genome-spy/core/view/viewUtils.js";
import { configureViewOpacity } from "@genome-spy/core/genomeSpy/viewHierarchyConfig.js";
import {
    collectViewSubtreeDataSources,
    initializeViewSubtree,
    loadViewSubtreeData,
} from "@genome-spy/core/data/flowInit.js";
import { subscribeTo } from "../../state/subscribeTo.js";
import { buildPathTree, METADATA_PATH_SEPARATOR } from "./metadataUtils.js";
import { splitPath } from "../../utils/escapeSeparator.js";
import { createDefaultValuesProvider } from "../attributeValues.js";
import { ReadyGate, createFinalizeOnce } from "../../utils/readyGate.js";

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

    #metadataGeneration = 0;

    /** @type {ReadyGate} */
    #metadataReady = new ReadyGate("Metadata readiness was aborted.");

    /** @type {WeakMap<View, string>} */
    #viewToAttribute = new WeakMap();

    /**
     * @type {(identifier: import("../types.js").AttributeIdentifier) => import("../types.js").AttributeInfo}
     */
    #attributeInfoSource;

    /**
     * @type {import("@genome-spy/core/view/view.js").default}
     */
    #highlightTarget;

    /**
     * @param {import("../sampleView.js").default} sampleView
     * @param {import("@genome-spy/core/view/containerView.js").default} sidebarView
     */
    constructor(sampleView, sidebarView) {
        super(
            {
                name: "sample-metadata",
                title: "Sample metadata",
                configurableVisibility: true,
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
            sidebarView,
            sidebarView,
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

        this.#attributeInfoSource = (attribute) =>
            this.getAttributeInfo(/** @type {string} */ (attribute.specifier));

        this.#sampleView.compositeAttributeInfoSource.addAttributeInfoSource(
            SAMPLE_ATTRIBUTE,
            this.#attributeInfoSource
        );

        this.registerDisposer(
            subscribeTo(
                this.#sampleView.provenance.store,
                (state) => state.provenance.present.sampleView.sampleMetadata,
                (sampleMetadata) => {
                    void this.#setMetadata(sampleMetadata);
                }
            )
        );

        this.addInteractionEventListener(
            "contextmenu",
            this.handleContextMenu.bind(this)
        );

        /** @type {import("@genome-spy/core/view/view.js").InteractionEventListener} */
        const mouseMoveListener = (coords, event) => {
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
        };

        this.addInteractionEventListener("mousemove", mouseMoveListener);

        // TODO: Implement "mouseleave" event. Let's hack for now...
        this.#highlightTarget = peek([
            ...this.#sampleView.getLayoutAncestors(),
        ]);
        /** @type {import("@genome-spy/core/view/view.js").InteractionEventListener} */
        const highlightTargetListener = (coords, event) => {
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
            highlightTargetListener
        );
        this.registerDisposer(() => {
            this.#highlightTarget.removeInteractionEventListener(
                "mousemove",
                highlightTargetListener
            );
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
            appendPlotMenuItems(items, attributeInfo, this.#sampleView);
        }

        contextMenu({ items }, event.mouseEvent);
    }

    /**
     * @param {import("../state/sampleState.js").SampleMetadata} sampleMetadata
     */
    async #setMetadata(sampleMetadata) {
        this.#metadata = sampleMetadata.entities;

        const flow = this.context.dataFlow;

        const metadataGeneration = ++this.#metadataGeneration;
        const ready = this.#metadataReady.reset();
        const finalizeReady = createFinalizeOnce(ready);
        // Each metadata update starts a new readiness cycle. finalizeReady is
        // a single-shot completion hook so overlapping updates can exit early
        // without double-resolving when stale generations bail out.

        try {
            this.#createViews();
            await this.createAxes();
            if (this.#isMetadataStale(metadataGeneration)) {
                finalizeReady();
                return;
            }
            // Opacity may depend on resolved scales; configure after the subtree exists.
            configureViewOpacity(this);

            const viewPredicate = (
                /** @type {import("@genome-spy/core/view/view.js").default} */ view
            ) => view.isConfiguredVisible();
            const dynamicSource = this.#initializeMetadataSubtree(
                flow,
                viewPredicate,
                metadataGeneration
            );

            dynamicSource.updateDynamicData(
                this.#buildMetadataTable(sampleMetadata)
            );

            await this.#loadMetadataSubtree(dynamicSource, viewPredicate);
            if (this.#isMetadataStale(metadataGeneration)) {
                finalizeReady();
                return;
            }

            // Metadata updates can finish before all color scale domains have
            // reconfigured from the new data, which leaves bookmark capture or
            // subsequent actions reading stale domains. As a pragmatic fix,
            // force a domain refresh here. Option two would be to await domain
            // change events instead, but that adds more complexity and edge cases.
            this.#refreshMetadataDomains();

            this.context.requestLayoutReflow();
        } catch (error) {
            finalizeReady(
                error instanceof Error ? error : new Error(String(error))
            );
            throw error;
        } finally {
            finalizeReady();
        }
    }

    /**
     * @param {number} metadataGeneration
     * @returns {boolean}
     */
    #isMetadataStale(metadataGeneration) {
        return metadataGeneration !== this.#metadataGeneration;
    }

    /**
     * Initializes the metadata subtree and returns the dynamic data source.
     *
     * @param {import("@genome-spy/core/data/dataFlow.js").default} flow
     * @param {(view: import("@genome-spy/core/view/view.js").default) => boolean} viewPredicate
     * @param {number} metadataGeneration
     * @returns {import("@genome-spy/core/data/sources/namedSource.js").default}
     */
    #initializeMetadataSubtree(flow, viewPredicate, metadataGeneration) {
        const { graphicsPromises } = initializeViewSubtree(
            this,
            flow,
            viewPredicate
        );
        const dynamicSource =
            /** @type {import("@genome-spy/core/data/sources/namedSource.js").default} */ (
                this.flowHandle?.dataSource
            );

        if (!dynamicSource) {
            throw new Error("Cannot find metadata data source handle!");
        }

        finalizeSubtreeGraphics(
            graphicsPromises,
            () => metadataGeneration === this.#metadataGeneration
        );

        return dynamicSource;
    }

    /**
     * Builds a metadata table with sample index numbers for sorting.
     *
     * @param {import("../state/sampleState.js").SampleMetadata} sampleMetadata
     * @returns {Array<Record<string, unknown>>}
     */
    #buildMetadataTable(sampleMetadata) {
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

        return metadataTable;
    }

    /**
     * Forces metadata color scale resolutions to reconfigure their domains
     * after a metadata update.
     */
    #refreshMetadataDomains() {
        /** @type {Set<import("@genome-spy/core/scales/scaleResolution.js").default>} */
        const resolutions = new Set();
        this.visit((view) => {
            if (view instanceof UnitView) {
                const resolution = view.getScaleResolution("color");
                if (resolution) {
                    resolutions.add(resolution);
                }
            }
        });
        for (const resolution of resolutions) {
            resolution.reconfigureDomain();
        }
    }

    /**
     * Loads non-metadata sources so axes/titles can resolve domains.
     *
     * @param {import("@genome-spy/core/data/sources/namedSource.js").default} dynamicSource
     * @param {(view: import("@genome-spy/core/view/view.js").default) => boolean} viewPredicate
     * @returns {Promise<void[]>}
     */
    #loadMetadataSubtree(dynamicSource, viewPredicate) {
        const dataSources = collectViewSubtreeDataSources(this, viewPredicate);
        dataSources.delete(dynamicSource);
        return loadViewSubtreeData(this, dataSources);
    }

    /**
     * Waits until the latest metadata update has finished applying data and domains.
     *
     * @param {AbortSignal} [signal]
     * @returns {Promise<void>}
     */
    awaitMetadataReady(signal) {
        return this.#metadataReady.wait(signal);
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
         * @param {import("@genome-spy/app/spec/sampleView.js").SampleAttributeDef} inheritedAttributeDef
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
            valuesProvider: createDefaultValuesProvider(
                (sampleId, sampleHierarchy) =>
                    sampleHierarchy.sampleMetadata.entities[sampleId]?.[
                        attributeName
                    ]
            ),
            type: resolution.type,
            scale: resolution.getScale(),
            title: html`<em class="attribute">${attributeName}</em>`,
            emphasizedName: attributeName,
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
        this.#sampleView.compositeAttributeInfoSource.removeAttributeInfoSource(
            SAMPLE_ATTRIBUTE,
            this.#attributeInfoSource
        );
        this._attributeHighlighState.abortController.abort();
    }
}

/**
 * @param {string} attributeName
 * @param {import("@genome-spy/app/spec/sampleView.js").SampleAttributeDef} attributeDef
 * @param {import("@genome-spy/app/spec/sampleView.js").SampleDef} sampleDef
 */
function createAttributeSpec(attributeName, attributeDef, sampleDef) {
    if (!attributeDef) {
        throw new Error("No attribute definition for " + attributeName);
    }

    const escapedEncodingField = escapeFieldName(attributeName);
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
                field: escapedEncodingField,
                type: attributeDef.type,
                scale: attributeDef.scale,
            },
        },
        opacity: 1,
    };

    if (attributeDef.barScale && attributeDef.type == "quantitative") {
        attributeSpec.encoding.x = {
            field: escapedEncodingField,
            type: attributeDef.type,
            scale: attributeDef.barScale,
            axis: null,
        };
    }

    return attributeSpec;
}

/**
 * Escapes special field path characters so dot-containing names are treated
 * as literal keys in Vega field accessors.
 *
 * @param {string} fieldName
 * @returns {string}
 */
function escapeFieldName(fieldName) {
    return fieldName
        .replaceAll("\\", "\\\\")
        .replaceAll(".", "\\.")
        .replaceAll("[", "\\[")
        .replaceAll("]", "\\]");
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
