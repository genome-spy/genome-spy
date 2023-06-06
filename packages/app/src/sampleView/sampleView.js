import { isNumber, isObject } from "vega-util";
import { html } from "lit";
import {
    findEncodedFields,
    findUniqueViewNames,
} from "@genome-spy/core/view/viewUtils";
import ContainerView from "@genome-spy/core/view/containerView";
import {
    mapToPixelCoords,
    scaleLocSize,
} from "@genome-spy/core/utils/layout/flexLayout";
import { MetadataView } from "./metadataView";
import generateAttributeContextMenu from "./attributeContextMenu";
import { formatLocus } from "@genome-spy/core/genome/locusFormat";
import Padding from "@genome-spy/core/utils/layout/padding";
import clamp from "@genome-spy/core/utils/clamp";
import createDataSource from "@genome-spy/core/data/sources/dataSourceFactory";
import FlowNode from "@genome-spy/core/data/flowNode";
import { createChain } from "@genome-spy/core/view/flowBuilder";
import ConcatView from "@genome-spy/core/view/concatView";
import UnitView from "@genome-spy/core/view/unitView";
import { GroupPanel } from "./groupPanel";
import {
    createSampleSlice,
    getActionInfo,
    getFlattenedGroupHierarchy,
    sampleHierarchySelector,
    SAMPLE_SLICE_NAME,
} from "./sampleSlice";
import CompositeAttributeInfoSource from "./compositeAttributeInfoSource";
import { watch } from "../state/watch";
import { createSelector } from "@reduxjs/toolkit";
import { LocationManager, getSampleLocationAt } from "./locationManager";
import { contextMenu, DIVIDER } from "../utils/ui/contextMenu";
import interactionToZoom from "@genome-spy/core/view/zoom";
import Rectangle from "@genome-spy/core/utils/layout/rectangle";
import { faArrowsAltV, faXmark } from "@fortawesome/free-solid-svg-icons";
import {
    createBackground,
    createBackgroundStroke,
    GridChild,
    translateAxisCoords,
} from "@genome-spy/core/view/gridView";
import { isChannelWithScale } from "@genome-spy/core/encoder/encoder";
import { isAggregateSamplesSpec } from "@genome-spy/core/view/viewFactory";

const VALUE_AT_LOCUS = "VALUE_AT_LOCUS";

/**
 * Implements faceting of multiple samples. The samples are displayed
 * as tracks and optional metadata.
 *
 */
export default class SampleView extends ContainerView {
    /**
     * @typedef {import("./sampleState").Group} Group
     * @typedef {import("./sampleState").Sample} Sample
     * @typedef {import("@genome-spy/core/utils/layout/flexLayout").LocSize} LocSize
     * @typedef {import("@genome-spy/core/view/view").default} View
     * @typedef {import("@genome-spy/core/view/layerView").default} LayerView
     * @typedef {import("@genome-spy/core/data/dataFlow").default<View>} DataFlow
     * @typedef {import("@genome-spy/core/genome/genome").ChromosomalLocus} ChromosomalLocus
     *
     * @typedef {object} LocusSpecifier
     * @prop {string} view A unique name of the view
     * @prop {string} field
     * @prop {number | ChromosomalLocus} locus Locus on the domain
     *
     * @typedef {import("./sampleViewTypes").SampleLocation} SampleLocation
     * @typedef {import("./sampleViewTypes").GroupLocation} GroupLocation
     */

    /** @type {SampleGridChild} */
    #gridChild;

    /** @type {ConcatView} */
    #sidebarView;

    /** @type {number} Recorded so that peek can be offset correctly */
    #lastMouseY = -1;

    #stickySummaries = false;

    /**
     *
     * @param {import("@genome-spy/core/spec/sampleView").SampleSpec} spec
     * @param {import("@genome-spy/core/types/viewContext").default} context
     * @param {ContainerView} layoutParent
     * @param {import("@genome-spy/core/view/view").default} dataParent
     * @param {string} name
     * @param {import("../state/provenance").default<any>} provenance
     */
    constructor(spec, context, layoutParent, dataParent, name, provenance) {
        super(spec, context, layoutParent, dataParent, name);

        this.provenance = provenance;

        this.spec = spec;
        this.#stickySummaries = spec.stickySummaries ?? true;

        // TODO: Make this a function, not a class
        this.compositeAttributeInfoSource = new CompositeAttributeInfoSource();

        this.#gridChild = new SampleGridChild(
            context.createView(spec.spec, this, this, "sample-facets"),
            this,
            0,
            this.spec.view
        );

        /**
         * @type {(UnitView | LayerView)[]}
         */
        this.#createSummaryViews();

        this.childCoords = Rectangle.ZERO;

        /**
         * Container for group markers and metadata.
         * @type {ConcatView}
         */
        this.#sidebarView = new ConcatView(
            {
                title: "Sidebar",
                resolve: {
                    scale: { default: "independent" },
                    axis: { default: "independent" },
                },
                encoding: {
                    y: null,
                    facetIndex: null,
                },
                hconcat: [],
                spacing: 0,
            },
            context,
            this,
            this,
            "sample-sidebar"
        );
        this.sidebarCoords = Rectangle.ZERO;

        this.groupPanel = new GroupPanel(this, this.#sidebarView);
        this.metadataView = new MetadataView(this, this.#sidebarView);

        this.#sidebarView.setChildren([this.groupPanel, this.metadataView]);

        this.#gridChild.view.addInteractionEventListener(
            "contextmenu",
            this.#handleContextMenu.bind(this)
        );

        this.locationManager = new LocationManager({
            getSampleHierarchy: () => this.sampleHierarchy,
            getHeight: () => this.childCoords.height,
            getSummaryHeight: () =>
                this.#gridChild.summaryViews.getSize().height.px,
            onLocationUpdate: () => {
                this.groupPanel.updateGroups();
            },
            viewContext: this.context,
            isStickySummaries: () => this.#stickySummaries,
        });

        this.provenance.storeHelper.subscribe(
            watch(
                (state) => sampleHierarchySelector(state).rootGroup,
                (rootGroup) => {
                    this.locationManager.reset();

                    this.groupPanel.updateGroups();

                    this.context.requestLayoutReflow();
                    this.context.animator.requestRender();
                }
            )
        );

        this.provenance.storeHelper.subscribe(
            watch(
                (state) => sampleHierarchySelector(state).sampleData,
                (sampleData) => {
                    const samples =
                        sampleData && Object.values(sampleData.entities);
                    if (!samples) {
                        return;
                    }

                    this.metadataView.setSamples(samples);

                    // Feed some initial dynamic data.
                    this.groupPanel.updateGroups();
                }
            )
        );

        this.compositeAttributeInfoSource.addAttributeInfoSource(
            VALUE_AT_LOCUS,
            (attributeIdentifier) => {
                const specifier = /** @type {LocusSpecifier} */ (
                    attributeIdentifier.specifier
                );
                const view = /** @type {UnitView} */ (
                    this.findDescendantByName(specifier.view)
                );

                /** @type {number} */
                let numericLocus;
                if (isNumber(specifier.locus)) {
                    numericLocus = specifier.locus;
                } else {
                    const genome = this.getScaleResolution("x").getGenome();
                    if (genome) {
                        numericLocus = genome.toContinuous(
                            specifier.locus.chrom,
                            specifier.locus.pos
                        );
                    } else {
                        throw new Error(
                            "Encountered a complex locus but no genome is available!"
                        );
                    }
                }

                /** @param {string} sampleId */
                const accessor = (sampleId) =>
                    view.mark.findDatumAt(sampleId, numericLocus)?.[
                        specifier.field
                    ];

                // Find the channel and scale that matches the field
                const [channel, channelDef] = Object.entries(
                    view.getEncoding()
                ).find(
                    ([_channel, channelDef]) =>
                        "field" in channelDef &&
                        channelDef.field == specifier.field
                );
                const scale = isChannelWithScale(channel)
                    ? view.getScaleResolution(channel).getScale()
                    : undefined;

                /** @type {import("./types").AttributeInfo} */
                const attributeInfo = {
                    name: specifier.field,
                    attribute: attributeIdentifier,
                    // TODO: Truncate view title: https://css-tricks.com/snippets/css/truncate-string-with-ellipsis/
                    title: html`
                        <em class="attribute">${specifier.field}</em>
                        <span class="viewTitle"
                            >(${view.getTitleText() ?? view.name})</span
                        >
                        at
                        <span class="locus"
                            >${locusToString(specifier.locus)}</span
                        >
                    `,
                    accessor,
                    // TODO: Ensure that there's a type even if it's missing from spec
                    type: "type" in channelDef ? channelDef.type : undefined,
                    scale,
                };

                return attributeInfo;
            }
        );

        this._addBroadcastHandler("dataLoaded", () =>
            this.#extractSamplesFromData()
        );

        this._addBroadcastHandler("layout", () => {
            this.locationManager.resetLocations();
        });

        this.addInteractionEventListener("mousemove", (coords, event) => {
            // TODO: Should be reset to undefined on mouseout
            this.#lastMouseY = event.point.y - this.childCoords.y;
        });

        this.addInteractionEventListener(
            "wheel",
            (coords, event) => {
                const wheelEvent = /** @type {WheelEvent} */ (event.uiEvent);
                if (this.locationManager.isCloseup() && !wheelEvent.ctrlKey) {
                    this.locationManager.handleWheelEvent(wheelEvent);

                    this.groupPanel.updateRange();
                    /*
					// Putting this to transition phase causes latency of one frame.
					// TODO: Investigate why.
                    this.context.animator.requestTransition(() =>
                        this.groupView.updateRange()
					);
					*/
                    this.context.animator.requestRender();

                    // Replace the uiEvent to prevent decoratorView from zooming.
                    // Only allow horizontal panning.
                    event.uiEvent = {
                        type: wheelEvent.type,
                        // @ts-ignore
                        deltaX: wheelEvent.deltaX,
                        preventDefault:
                            wheelEvent.preventDefault.bind(wheelEvent),
                    };
                }
            },
            true
        );

        // TODO: Remove when appropriate
        // TODO: Check that the mouse pointer is inside the view (or inside the app instance)
        context.addKeyboardListener("keydown", (event) => {
            if (event.code == "KeyE" && !event.repeat) {
                const mouseY = this.#lastMouseY;
                const sampleId = this.getSampleAt(mouseY)?.id;

                this.locationManager.togglePeek(undefined, mouseY, sampleId);
            }
        });
        context.addKeyboardListener("keyup", (event) => {
            if (event.code == "KeyE") {
                this.locationManager.togglePeek(false);
            }
        });

        const getAttributeInfo = (
            /** @type {import("./types").AttributeInfo} */ attribute
        ) => this.compositeAttributeInfoSource.getAttributeInfo(attribute);

        const sampleSlice = createSampleSlice(getAttributeInfo);
        this.provenance.addReducer(sampleSlice.name, sampleSlice.reducer);
        this.provenance.addActionInfoSource(
            (
                /** @type {import("@reduxjs/toolkit").PayloadAction<any>} */ action
            ) => getActionInfo(action, getAttributeInfo)
        );

        this.actions = sampleSlice.actions;

        const sampleSelector = createSelector(
            (
                /** @type {import("./sampleState").SampleHierarchy} */ sampleHierarchy
            ) => sampleHierarchy.sampleData?.entities,
            (entities) => entities && Object.values(entities)
        );

        /** Returns the samples as a flat array */
        this.getSamples = () => sampleSelector(this.sampleHierarchy);

        if (this.spec.samples.data) {
            this.#loadSamples();
        } else {
            // TODO: schedule: extractSamplesFromData()
        }
    }

    onScalesResolved() {
        super.onScalesResolved();

        this.#gridChild.createAxes();
    }

    /**
     * @returns {Padding}
     * @override
     */
    getOverhang() {
        let peripherySize = this.#sidebarView.isConfiguredVisible()
            ? this.#sidebarView.getSize().width.px +
              this.#sidebarView.getPadding().horizontalTotal
            : 0;

        return new Padding(0, 0, 0, peripherySize).add(
            this.#gridChild.getOverhang()
        );
    }

    /**
     * @returns {IterableIterator<View>}
     */
    *[Symbol.iterator]() {
        yield this.#sidebarView;

        yield* this.#gridChild.getChildren();
    }

    #loadSamples() {
        if (!this.spec.samples.data) {
            throw new Error(
                "SampleView has no explicit sample metadata specified! Cannot load anything."
            );
        }

        const { dataSource, collector } = createChain(
            createDataSource(this.spec.samples.data, this),
            new ProcessSample()
        );

        collector.observers.push((collector) => {
            const samples = /** @type {Sample[]} */ (collector.getData());
            this.provenance.storeHelper.dispatch(
                this.actions.setSamples({ samples })
            );
        });

        // Synchronize loading with other data
        const key = "samples " + this.getPathString();
        // @ts-expect-error TODO: Using a string as key is ugly. Try something else.
        this.context.dataFlow.addDataSource(dataSource, key);
    }

    #extractSamplesFromData() {
        if (this.getSamples()) {
            return; // NOP
        }

        const resolution = this.getScaleResolution("sample");
        if (resolution) {
            const samples = resolution.getDataDomain().map((s, i) => ({
                id: s,
                displayName: s,
                indexNumber: i,
                attributes: [],
            }));

            this.provenance.storeHelper.dispatch(
                this.actions.setSamples({ samples })
            );
        } else {
            throw new Error(
                "No explicit sample data nor sample channels found!"
            );
        }
    }

    /**
     * @returns {import("./sampleState").SampleHierarchy}
     */
    get sampleHierarchy() {
        return this.provenance.getPresentState()[SAMPLE_SLICE_NAME];
    }

    get leafSamples() {
        // TODO: Memoize using createSelector or something
        const sampleGroups =
            /** @type {import("./sampleState").SampleGroup[]} */ (
                getFlattenedGroupHierarchy(this.sampleHierarchy).map((path) =>
                    path.at(-1)
                )
            );

        return sampleGroups.map((sampleGroup) => sampleGroup.samples).flat();
    }

    /**
     * @param {number} pos
     */
    getSampleAt(pos) {
        const match = getSampleLocationAt(
            pos,
            this.locationManager.getLocations().samples
        );
        if (match) {
            return this.sampleHierarchy.sampleData.entities[match.key];
        }
    }

    /**
     * @type {import("@genome-spy/core/types/rendering").RenderMethod}
     */
    #renderChild(context, coords, options = {}) {
        const heightFactor = 1 / coords.height;
        const heightFactorSource = () => heightFactor;

        const clipRect = this.locationManager.clipBySummary(coords);

        const sampleOptions = this.locationManager
            .getLocations()
            .samples.map((sampleLocation) => ({
                ...options,
                sampleFacetRenderingOptions: {
                    locSize: scaleLocSize(
                        sampleLocation.locSize,
                        heightFactorSource
                    ),
                },
                facetId: [sampleLocation.key],
                clipRect,
            }));

        for (const opt of sampleOptions) {
            this.#gridChild.background?.render(context, coords, opt);
            this.#gridChild.view.render(context, coords, opt);
        }
    }

    /**
     * @type {import("@genome-spy/core/types/rendering").RenderMethod}
     */
    #renderSummaries(context, coords, options = {}) {
        const summaryViews = this.#gridChild.summaryViews;
        const summaryOverhang = summaryViews.getOverhang().getHorizontal();

        options = {
            ...options,
            clipRect: coords.expand(summaryOverhang),
        };

        const summaryHeight = summaryViews.getSize().height.px;

        for (const [i, summaryLocation] of this.locationManager
            .getLocations()
            .summaries.entries()) {
            const y = () => {
                const gLoc = summaryLocation.locSize.location;
                let pos = coords.y + gLoc;
                return this.#stickySummaries
                    ? pos +
                          clamp(
                              -gLoc,
                              0,
                              summaryLocation.locSize.size - summaryHeight
                          )
                    : pos;
            };

            const summaryCoords = coords
                .modify({ y, height: summaryHeight })
                .expand(summaryOverhang);

            summaryViews.render(context, summaryCoords, {
                ...options,
                facetId: [i],
            });
        }
    }

    /**
     * @type {import("@genome-spy/core/types/rendering").RenderMethod}
     */
    render(context, coords, options = {}) {
        if (!this.isConfiguredVisible()) {
            return;
        }

        if (!this.layoutParent) {
            // Usually padding is applied by GridView, but if this is the root view, we need to apply it here
            coords = coords.shrink(this.getPadding());
        }

        coords = coords.shrink(this.#gridChild.getOverhang());
        // TODO: Should also consider the overhang of the summaries.

        context.pushView(this, coords);

        const cols = mapToPixelCoords(
            [
                this.#sidebarView.isConfiguredVisible()
                    ? this.#sidebarView.getSize().width
                    : { px: 0 },
                { grow: 1 },
            ],
            coords.width
            //{ spacing: SPACING }
        );

        /** @param {LocSize} location */
        const toColumnCoords = (location) =>
            coords.modify({
                x: location.location + coords.x,
                width: location.size,
            });

        this.sidebarCoords = toColumnCoords(cols[0]);
        this.childCoords = toColumnCoords(cols[1]);

        this.#sidebarView.render(context, this.sidebarCoords, options);

        this.#renderSummaries(context, this.childCoords, options);

        const backgroundRects =
            !this.#gridChild.groupBackground &&
            !Object.values(this.#gridChild.axes).length
                ? this.locationManager.getGroupBackgroundRects(this.childCoords)
                : [];

        for (const { coords, clipRect } of backgroundRects) {
            this.#gridChild.groupBackground?.render(context, coords, options);

            for (const gridLine of Object.values(this.#gridChild.gridLines)) {
                gridLine.render(context, coords, { ...options, clipRect });
            }
        }

        this.#renderChild(context, this.childCoords, options);

        for (const { coords } of backgroundRects) {
            this.#gridChild.groupBackgroundStroke?.render(
                context,
                coords,
                options
            );
        }

        for (const [orient, axisView] of Object.entries(this.#gridChild.axes)) {
            axisView.render(
                context,
                translateAxisCoords(this.childCoords, orient, axisView)
            );
        }

        context.popView(this);
    }

    onBeforeRender() {
        // TODO: Only when needed
        this.locationManager.updateFacetTexture();
    }

    getSampleFacetTexture() {
        return this.locationManager.getFacetTexture();
    }

    /**
     *
     * @returns {import("../utils/ui/contextMenu").MenuItem}
     */
    makePeekMenuItem() {
        return {
            ...(!this.locationManager.isCloseup()
                ? {
                      label: "Open closeup",
                      callback: () => this.locationManager.togglePeek(true),
                      icon: faArrowsAltV,
                  }
                : {
                      label: "Close closeup",
                      callback: () => this.locationManager.togglePeek(false),
                      icon: faXmark,
                  }),

            shortcut: "E",
        };
    }

    /**
     * @param {import("@genome-spy/core/utils/layout/rectangle").default} coords
     *      Coordinates of the view
     * @param {import("@genome-spy/core/utils/interactionEvent").default} event
     */
    #handleContextMenu(coords, event) {
        // TODO: Allow for registering listeners
        const mouseEvent = /** @type {MouseEvent} */ (event.uiEvent);

        const normalizedXPos = this.childCoords.normalizePoint(
            event.point.x,
            event.point.y
        ).x;

        const complexX =
            this.getScaleResolution("x").invertToComplex(normalizedXPos);

        const uniqueViewNames = findUniqueViewNames(
            [...this.getLayoutAncestors()].at(-1)
        );

        const fieldInfos = findEncodedFields(this.#gridChild.view)
            .filter((d) => !["sample", "x", "x2"].includes(d.channel))
            // TODO: A method to check if a mark covers a range (both x and x2 defined)
            .filter((info) =>
                ["rect", "rule"].includes(info.view.getMarkType())
            )
            // TODO: Log a warning if the view name is not unique
            .filter((info) => uniqueViewNames.has(info.view.name));

        /** @type {import("../utils/ui/contextMenu").MenuItem[]} */
        let items = [
            this.makePeekMenuItem(),
            DIVIDER,
            {
                label: `Locus: ${locusToString(complexX)}`,
                type: "header",
            },
            DIVIDER,
        ];

        let previousContextTitle = "";

        for (const [i, fieldInfo] of fieldInfos.entries()) {
            /** @type {LocusSpecifier} */
            const specifier = {
                // TODO: Relative path
                view: fieldInfo.view.name,
                field: fieldInfo.field,
                locus: complexX,
            };

            const attributeInfo =
                this.compositeAttributeInfoSource.getAttributeInfo({
                    type: VALUE_AT_LOCUS,
                    specifier,
                });

            const contextTitle =
                fieldInfo.view.getTitleText() ?? fieldInfo.view.spec.name;
            if (contextTitle != previousContextTitle) {
                if (i > 0) {
                    items.push({ type: "divider" });
                }
                items.push({
                    label: contextTitle,
                    type: "header",
                });
                previousContextTitle = contextTitle;
            }

            items.push({
                label: fieldInfo.field,
                submenu: generateAttributeContextMenu(
                    null,
                    attributeInfo,
                    // TODO: Get the value from data
                    // But ability to remove undefined is useful too
                    undefined,
                    this
                ),
            });
        }

        contextMenu({ items }, mouseEvent);
    }

    /**
     * @param {import("@genome-spy/core/utils/interactionEvent").default} event
     */
    propagateInteractionEvent(event) {
        this.handleInteractionEvent(undefined, event, true);

        if (event.stopped) {
            return;
        }

        if (this.childCoords.containsPoint(event.point.x, event.point.y)) {
            this.#gridChild.view.propagateInteractionEvent(event);
            // Hmm. Perhaps this could be attached to the child
            interactionToZoom(
                event,
                this.childCoords,
                (zoomEvent) =>
                    this.#handleZoom(
                        this.childCoords,
                        this.#gridChild.view,
                        zoomEvent
                    ),
                this.context.getCurrentHover()
            );
        }

        if (this.sidebarCoords.containsPoint(event.point.x, event.point.y)) {
            this.#sidebarView.propagateInteractionEvent(event);
        }

        if (event.stopped) {
            return;
        }

        this.handleInteractionEvent(undefined, event, false);
    }

    /**
     *
     * @param {import("@genome-spy/core/utils/layout/rectangle").default} coords Coordinates
     * @param {View} view
     * @param {import("@genome-spy/core/view/zoom").ZoomEvent} zoomEvent
     */
    #handleZoom(coords, view, zoomEvent) {
        const resolution = this.#gridChild.view.getScaleResolution("x");
        if (!resolution || !resolution.isZoomable()) {
            return;
        }

        const p = coords.normalizePoint(zoomEvent.x, zoomEvent.y);
        const tp = coords.normalizePoint(
            zoomEvent.x + zoomEvent.xDelta,
            zoomEvent.y + zoomEvent.yDelta
        );

        resolution.zoom(2 ** zoomEvent.zDelta, p.x, tp.x - p.x);

        this.context.animator.requestRender();
    }

    #createSummaryViews() {
        /** @type {View[]} */
        const summaryViews = [];

        for (const view of this.#gridChild.view.getDescendants()) {
            const spec = view.spec;
            if (!isAggregateSamplesSpec(spec)) {
                continue;
            }
            for (const sumSpec of spec.aggregateSamples) {
                const transform = sumSpec.transform ?? [];
                if (transform.length && transform.at(-1).type != "collect") {
                    // MergeFacets must be a direct child of Collector
                    transform.push({ type: "collect" });
                }
                transform.push({ type: "mergeFacets" });
                sumSpec.transform = transform;

                sumSpec.encoding = {
                    ...(sumSpec.encoding ?? {}),
                    sample: null,
                };

                const summaryView = /** @type { UnitView | LayerView } */ (
                    this.context.createView(sumSpec, this, view, "summaryView")
                );

                /**
                 * @param {View} [whoIsAsking]
                 */
                summaryView.getFacetFields = (whoIsAsking) => undefined;

                summaryViews.push(summaryView);
            }
        }

        this.#gridChild.summaryViews.setChildren(summaryViews);
    }

    /**
     * @param {string} channel
     * @param {import("@genome-spy/core/spec/view").ResolutionTarget} resolutionType
     * @returns {import("@genome-spy/core/spec/view").ResolutionBehavior}
     */
    getDefaultResolution(channel, resolutionType) {
        if (resolutionType == "axis") {
            return "independent";
        }

        switch (channel) {
            case "x":
            case "sample":
                return "shared";
            default:
                return "independent";
        }
    }
}

/**
 * @param {number | ChromosomalLocus} locus
 */
function locusToString(locus) {
    return !isNumber(locus) && "chrom" in locus
        ? formatLocus(locus)
        : "" + locus;
}

class ProcessSample extends FlowNode {
    constructor() {
        super();
        this.reset();
    }

    reset() {
        this._index = 0;
    }

    /**
     *
     * @param {import("@genome-spy/core/data/flowNode").Datum} datum
     */
    handle(datum) {
        this._propagate({
            id: datum.sample,
            displayName: datum.displayName || datum.sample,
            indexNumber: this._index++,
            attributes: extractAttributes(datum),
        });
    }
}

/**
 *
 * @param {any} row
 */
function extractAttributes(row) {
    const attributes = Object.assign({}, row);
    delete attributes.sample;
    delete attributes.displayName;
    return attributes;
}

/**
 *
 * @param {import("@genome-spy/core/spec/view").ViewSpec} spec
 * @returns {spec is SampleSpec}
 */
export function isSampleSpec(spec) {
    return (
        "samples" in spec &&
        isObject(spec.samples) &&
        "spec" in spec &&
        isObject(spec.spec)
    );
}

class SampleGridChild extends GridChild {
    /**
     * @param {View} view
     * @param {ContainerView} layoutParent
     * @param {number} serial
     * @param {import("@genome-spy/core/spec/view").ViewBackground} [viewBackgroundSpec]
     */
    constructor(view, layoutParent, serial, viewBackgroundSpec) {
        super(view, layoutParent, serial);

        /** @type {UnitView} */
        this.groupBackground = undefined;
        /** @type {UnitView} */
        this.groupBackgroundStroke = undefined;

        const backgroundSpec = createBackground(viewBackgroundSpec);
        if (backgroundSpec) {
            this.groupBackground = new UnitView(
                backgroundSpec,
                layoutParent.context,
                layoutParent,
                view,
                "sample-group-background-" + serial
            );
            // TODO: Make configurable through spec:
            this.groupBackground.blockEncodingInheritance = true;
        }

        const backgroundStrokeSpec = createBackgroundStroke(viewBackgroundSpec);
        if (backgroundStrokeSpec) {
            this.groupBackgroundStroke = new UnitView(
                backgroundStrokeSpec,
                layoutParent.context,
                layoutParent,
                view,
                "sample-group-background-stroke-" + serial
            );
            // TODO: Make configurable through spec:
            this.groupBackgroundStroke.blockEncodingInheritance = true;
        }

        this.summaryViews = new ConcatView(
            {
                configurableVisibility: false,
                resolve: {
                    axis: { x: "independent" },
                },
                spacing: 0, // Let the children use padding to configure spacing
                vconcat: [],
            },
            layoutParent.context,
            layoutParent,
            layoutParent,
            "sampleSummaries"
        );
    }

    *getChildren() {
        if (this.groupBackground) {
            yield this.groupBackground;
        }
        if (this.groupBackgroundStroke) {
            yield this.groupBackgroundStroke;
        }
        yield this.summaryViews;

        yield* super.getChildren();
    }
}
