import {
    findEncodedFields,
    findUniqueViewNames,
} from "@genome-spy/core/view/viewUtils.js";
import ContainerView from "@genome-spy/core/view/containerView.js";
import {
    FlexDimensions,
    mapToPixelCoords,
    scaleLocSize,
    sumSizeDefs,
} from "@genome-spy/core/view/layout/flexLayout.js";
import { MetadataView } from "./metadataView.js";
import generateAttributeContextMenu from "./attributeContextMenu.js";
import Padding from "@genome-spy/core/view/layout/padding.js";
import clamp from "@genome-spy/core/utils/clamp.js";
import createDataSource from "@genome-spy/core/data/sources/dataSourceFactory.js";
import FlowNode from "@genome-spy/core/data/flowNode.js";
import { createChain } from "@genome-spy/core/view/flowBuilder.js";
import ConcatView from "@genome-spy/core/view/concatView.js";
import UnitView from "@genome-spy/core/view/unitView.js";
import { GroupPanel } from "./groupPanel.js";
import {
    getFlattenedGroupHierarchy,
    sampleHierarchySelector,
    SAMPLE_SLICE_NAME,
} from "./sampleSlice.js";
import { getActionInfo } from "./actionInfo.js";
import CompositeAttributeInfoSource from "./compositeAttributeInfoSource.js";
import { subscribeTo, withMicrotask } from "../state/subscribeTo.js";
import { createSelector } from "@reduxjs/toolkit";
import { LocationManager, getSampleLocationAt } from "./locationManager.js";
import { contextMenu, DIVIDER } from "../utils/ui/contextMenu.js";
import { interactionToZoom } from "@genome-spy/core/view/zoom.js";
import Rectangle from "@genome-spy/core/view/layout/rectangle.js";
import { faArrowsAltV, faXmark } from "@fortawesome/free-solid-svg-icons";
import GridChild, {
    createBackground,
    createBackgroundStroke,
} from "@genome-spy/core/view/gridView/gridChild.js";
import { isAggregateSamplesSpec } from "@genome-spy/core/view/viewFactory.js";
import getViewAttributeInfo from "./viewAttributeInfoSource.js";
import { locusOrNumberToString } from "@genome-spy/core/genome/locusFormat.js";
import { translateAxisCoords } from "@genome-spy/core/view/gridView/gridView.js";

const VALUE_AT_LOCUS = "VALUE_AT_LOCUS";

/**
 * Implements faceting of multiple samples. The samples are displayed
 * as tracks and optional metadata.
 *
 */
export default class SampleView extends ContainerView {
    /**
     * @typedef {import("./sampleState.js").Group} Group
     * @typedef {import("./sampleState.js").Sample} Sample
     * @typedef {import("@genome-spy/core/view/layout/flexLayout.js").LocSize} LocSize
     * @typedef {import("@genome-spy/core/view/view.js").default} View
     * @typedef {import("@genome-spy/core/view/layerView.js").default} LayerView
     * @typedef {import("@genome-spy/core/data/dataFlow.js").default<View>} DataFlow
     * @typedef {import("@genome-spy/core/genome/genome.js").ChromosomalLocus} ChromosomalLocus
     */

    /** @type {SampleGridChild} */
    #gridChild;

    /** @type {ConcatView} */
    #sidebarView;

    /** @type {number} Recorded so that peek can be offset correctly */
    #lastMouseY = -1;

    #stickySummaries = false;

    /** @type {(param: any) => void} */
    #sampleHeightParam;

    /**
     *
     * @param {import("@genome-spy/core/spec/sampleView.js").SampleSpec} spec
     * @param {import("@genome-spy/core/types/viewContext.js").default} context
     * @param {ContainerView} layoutParent
     * @param {import("@genome-spy/core/view/view.js").default} dataParent
     * @param {string} name
     * @param {import("../state/provenance.js").default<any>} provenance
     * @param {any} [sampleSlice] Slice instance provided by App
     */
    constructor(
        spec,
        context,
        layoutParent,
        dataParent,
        name,
        provenance,
        sampleSlice
    ) {
        super(spec, context, layoutParent, dataParent, name);

        this.provenance = provenance;

        this.spec = spec;
        this.#stickySummaries = spec.stickySummaries ?? true;

        // TODO: Make this a function, not a class
        this.compositeAttributeInfoSource = new CompositeAttributeInfoSource();

        this.childCoords = Rectangle.ZERO;
        this.sidebarCoords = Rectangle.ZERO;

        this.locationManager = new LocationManager({
            getSampleHierarchy: () => this.sampleHierarchy,
            getHeight: () => this.childCoords.height,
            getSummaryHeight: () =>
                this.#gridChild.summaryViews.getSize().height.px,
            onLocationUpdate: ({ sampleHeight }) => {
                this.groupPanel.updateGroups();
                this.#sampleHeightParam?.(sampleHeight);
            },
            viewContext: this.context,
            isStickySummaries: () => this.#stickySummaries,
        });

        this.compositeAttributeInfoSource.addAttributeInfoSource(
            VALUE_AT_LOCUS,
            (attributeIdentifier) =>
                getViewAttributeInfo(this, attributeIdentifier)
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
                this.#openCloseup();
            }
        });
        context.addKeyboardListener("keyup", (event) => {
            if (event.code == "KeyE") {
                this.locationManager.togglePeek(false);
            }
        });

        const getAttributeInfo = (
            /** @type {import("./types.js").AttributeInfo} */ attribute
        ) => this.compositeAttributeInfoSource.getAttributeInfo(attribute);

        // Use the sample slice provided by App. App must provide the
        // slice instance; do not create a local fallback here.
        if (!sampleSlice) {
            throw new Error(
                "SampleView requires a `sampleSlice` instance from App"
            );
        }
        const slice = sampleSlice;
        /** @type {any} */ (slice).setAttributeInfoGetter(getAttributeInfo);

        this.provenance.addActionInfoSource(
            (
                /** @type {import("@reduxjs/toolkit").PayloadAction<any>} */ action
            ) => getActionInfo(action, getAttributeInfo)
        );

        this.actions = slice.actions;

        const sampleSelector = createSelector(
            (
                /** @type {import("./sampleState.js").SampleHierarchy} */ sampleHierarchy
            ) => sampleHierarchy.sampleData?.entities,
            (entities) => entities && Object.values(entities)
        );

        /** Returns the samples as a flat array */
        this.getSamples = () => sampleSelector(this.sampleHierarchy);

        subscribeTo(
            this.provenance.store,
            (state) => sampleHierarchySelector(state).rootGroup,
            withMicrotask((rootGroup) => {
                this.locationManager.reset();
                this.groupPanel?.updateGroups();
                this.context.requestLayoutReflow();
                this.context.animator.requestRender();
            })
        );

        subscribeTo(
            this.provenance.store,
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
        );

        if (this.spec.samples.data) {
            this.#loadSamples();
        } else {
            // TODO: schedule: extractSamplesFromData()
        }
    }

    async initializeChildren() {
        const childSpec = structuredClone(this.spec.spec);
        childSpec.params ??= [];
        childSpec.params.push({
            name: "height",
            value: 0,
        });

        this.#gridChild = new SampleGridChild(
            await this.context.createOrImportView(
                childSpec,
                this,
                this,
                "sample-facets"
            ),
            this,
            0,
            this.spec.view
        );

        this.#sampleHeightParam =
            this.#gridChild.view.paramMediator.getSetter("height");

        // TODO: Hack the sample height to sidebar as well.

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
            this.context,
            this,
            this,
            "sample-sidebar"
        );

        this.groupPanel = new GroupPanel(this, this.#sidebarView);
        this.metadataView = new MetadataView(this, this.#sidebarView);
        this.#sidebarView.setChildren([this.groupPanel, this.metadataView]);

        await this.#gridChild.createAxes();
        await this.#createSummaryViews();
        // @ts-expect-error TODO: Resolve this
        await this.#gridChild.summaryViews.createAxes();

        await this.groupPanel.initializeChildren();
        await this.metadataView.initializeChildren();

        this.#gridChild.view.addInteractionEventListener(
            "contextmenu",
            this.#handleContextMenu.bind(this)
        );
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
     * Returns the configured size, if present. Otherwise a computed or default
     * height is returned.
     *
     * @returns {import("@genome-spy/core/view/layout/flexLayout.js").FlexDimensions}
     * @override
     */
    getSize() {
        return this._cache("size/size2", () => {
            const superSize = super.getSize();

            /** @param {import("@genome-spy/core/view/view.js").default} view */
            const total = (view) =>
                view
                    .getSize()
                    .addPadding(view.getOverhang())
                    .addPadding(view.getPadding());

            const width = sumSizeDefs(
                [this.#sidebarView, this.#gridChild.view].map(
                    (view) => total(view).width
                )
            );

            return new FlexDimensions(width, superSize.height);
        });
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
            this.provenance.store.dispatch(
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

        // @ts-expect-error - Abusing ScaleResolution to collect sample identifiers. 'sample' has no scale.
        const resolution = this.getScaleResolution("sample");
        if (resolution) {
            // Use destructuring to get rid of the extra properties of DomainArray.
            // They are incompatible with Redux.
            const samples = [...resolution.getDataDomain()].map((s, i) => ({
                id: s,
                displayName: s,
                indexNumber: i,
                attributes: /** @type {Record<string, any>} */ ([]),
            }));

            this.provenance.store.dispatch(
                this.actions.setSamples({ samples })
            );
        } else {
            throw new Error(
                "No explicit sample data nor sample channels found!"
            );
        }
    }

    /**
     * @returns {import("./sampleState.js").SampleHierarchy}
     */
    get sampleHierarchy() {
        return this.provenance.getPresentState()[SAMPLE_SLICE_NAME];
    }

    get leafSamples() {
        // TODO: Memoize using createSelector or something
        const sampleGroups =
            /** @type {import("./sampleState.js").SampleGroup[]} */ (
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
     * @type {import("@genome-spy/core/types/rendering.js").RenderMethod}
     */
    #renderChild(context, coords, options = {}) {
        const gridChild = this.#gridChild;

        // Background and grid rendering --------

        const backgroundRects =
            gridChild.groupBackground || Object.values(gridChild.axes).length
                ? this.locationManager.getGroupBackgroundRects(this.childCoords)
                : [];

        for (const { coords, clipRect } of backgroundRects) {
            gridChild.groupBackground?.render(context, coords, options);

            for (const gridLine of Object.values(gridChild.gridLines)) {
                gridLine.render(context, coords, { ...options, clipRect });
            }
        }

        // Sample rendering --------

        const heightFactor = 1 / coords.height;
        const heightFactorSource = () => heightFactor;

        // Adjust clipRect if we have a sticky summary
        const clipRect = this.locationManager.clipBySummary(coords);

        const locations = this.locationManager.getLocations();

        const sampleOptions = locations.samples.map((sampleLocation) => ({
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

        // Render the view for each sample, pass location and facet id as options
        // TODO: Support facet texture as an alternative to multiple draw calls
        for (const opt of sampleOptions) {
            gridChild.background?.render(context, coords, opt);
            gridChild.view.render(context, coords, opt);
            gridChild.backgroundStroke?.render(context, coords, opt);
        }

        // Background stroke and axis rendering --------

        for (const { coords } of backgroundRects) {
            gridChild.groupBackgroundStroke?.render(context, coords, options);
        }

        for (const [orient, axisView] of Object.entries(gridChild.axes)) {
            axisView.render(
                context,
                translateAxisCoords(coords, orient, axisView)
            );
        }

        // Summary rendering --------

        const summaryViews = gridChild.summaryViews;
        const summaryOverhang = summaryViews.getOverhang().getHorizontal();

        options = {
            ...options,
            clipRect: coords.expand(summaryOverhang),
        };

        const summaryHeight = summaryViews.getSize().height.px;

        for (const [i, summaryLocation] of locations.summaries.entries()) {
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
                firstFacet: i == 0,
            });
        }

        gridChild.selectionRect?.render(context, coords, options);
    }

    /**
     * @type {import("@genome-spy/core/types/rendering.js").RenderMethod}
     */
    render(context, coords, options = {}) {
        super.render(context, coords, options);

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

        this.#renderChild(context, this.childCoords, options);

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
     * @returns {import("../utils/ui/contextMenu.js").MenuItem}
     */
    makePeekMenuItem() {
        return {
            ...(!this.locationManager.isCloseup()
                ? {
                      label: "Open closeup",
                      callback: () => this.#openCloseup(),
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
     * @param {import("@genome-spy/core/view/layout/rectangle.js").default} coords
     *      Coordinates of the view
     * @param {import("@genome-spy/core/utils/interactionEvent.js").default} event
     */
    findSampleForMouseEvent(coords, event) {
        return this.getSampleAt(event.point.y - this.childCoords.y);
    }

    #openCloseup() {
        const mouseY = this.#lastMouseY;
        const sampleId = this.getSampleAt(mouseY)?.id;
        this.locationManager.togglePeek(undefined, mouseY, sampleId);
    }

    /**
     * @param {import("@genome-spy/core/view/layout/rectangle.js").default} coords
     *      Coordinates of the view
     * @param {import("@genome-spy/core/utils/interactionEvent.js").default} event
     */
    #handleContextMenu(coords, event) {
        // TODO: Allow for registering listeners
        const mouseEvent = /** @type {MouseEvent} */ (event.uiEvent);

        const normalizedXPos = this.childCoords.normalizePoint(
            event.point.x,
            event.point.y
        ).x;

        const sample = this.findSampleForMouseEvent(coords, event);

        const view = this.#gridChild.view;

        const resolution = view.getScaleResolution("x");
        const complexX = resolution.invertToComplex(normalizedXPos);

        const uniqueViewNames = findUniqueViewNames(
            this.getLayoutAncestors().at(-1)
        );

        const axisTitle = view.getAxisResolution("x")?.getTitle();

        const fieldInfos = findEncodedFields(view)
            .filter((d) => !["sample", "x", "x2"].includes(d.channel))
            // TODO: A method to check if a mark covers a range (both x and x2 defined)
            .filter((info) =>
                ["rect", "rule"].includes(info.view.getMarkType())
            )
            // TODO: Log a warning if the view name is not unique
            .filter((info) => uniqueViewNames.has(info.view.name));

        // The same field may be used on multiple channels.
        const uniqueFieldInfos = Array.from(
            new Map(
                fieldInfos.map((info) => [
                    JSON.stringify([info.view.name, info.field]),
                    info,
                ])
            ).values()
        );

        /** @type {import("../utils/ui/contextMenu.js").MenuItem[]} */
        let items = [
            this.makePeekMenuItem(),
            DIVIDER,
            {
                label:
                    resolution.type === "locus"
                        ? `Locus: ${locusOrNumberToString(complexX)}`
                        : `${axisTitle ? axisTitle + ": " : ""}${complexX}`,
                type: "header",
            },
            DIVIDER,
        ];

        let previousContextTitle = "";

        for (const [i, fieldInfo] of uniqueFieldInfos.entries()) {
            /** @type {import("./sampleViewTypes.js").LocusSpecifier} */
            const specifier = {
                view: fieldInfo.view.name,
                field: fieldInfo.field,
                locus: complexX,
            };

            const attributeInfo =
                this.compositeAttributeInfoSource.getAttributeInfo({
                    type: VALUE_AT_LOCUS, // TODO: Come up with a more generic name for the type
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

            const scale = resolution.scale;
            const scalarX =
                "invert" in scale && sample
                    ? fieldInfo.view.mark.findDatumAt(
                          sample.id,
                          /** @type {import("@genome-spy/core/spec/channel.js").Scalar} */ (
                              scale.invert(normalizedXPos)
                          )
                      )?.[fieldInfo.field]
                    : undefined;

            items.push({
                label: fieldInfo.field,
                submenu: generateAttributeContextMenu(
                    null,
                    attributeInfo,
                    // TODO: Get the value from data
                    // But ability to remove undefined is useful too
                    scalarX,
                    this
                ),
            });
        }

        contextMenu({ items }, mouseEvent);
    }

    /**
     * @param {import("@genome-spy/core/utils/interactionEvent.js").default} event
     */
    propagateInteractionEvent(event) {
        this.handleInteractionEvent(undefined, event, true);

        if (event.stopped) {
            return;
        }

        if (this.childCoords.containsPoint(event.point.x, event.point.y)) {
            this.#gridChild.view.propagateInteractionEvent(event);

            if (event.stopped) {
                return;
            }

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
                this.context.getCurrentHover(),
                this.context.animator
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
     * @param {import("@genome-spy/core/view/layout/rectangle.js").default} coords Coordinates
     * @param {View} view
     * @param {import("@genome-spy/core/view/zoom.js").ZoomEvent} zoomEvent
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

    async #createSummaryViews() {
        /** @type {View[]} */
        const summaryViews = [];

        for (const view of this.#gridChild.view.getDescendants()) {
            const spec = view.spec;
            if (!isAggregateSamplesSpec(spec)) {
                continue;
            }
            for (const aggSpec of spec.aggregateSamples) {
                aggSpec.transform = [
                    { type: "mergeFacets" },
                    ...(aggSpec.transform ?? []),
                ];

                aggSpec.encoding = {
                    ...(aggSpec.encoding ?? {}),
                    sample: null,
                };

                const summaryView = /** @type { UnitView | LayerView } */ (
                    await this.context.createOrImportView(
                        aggSpec,
                        this,
                        view,
                        "summaryView"
                    )
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
     * @param {import("@genome-spy/core/spec/view.js").ResolutionTarget} resolutionType
     * @returns {import("@genome-spy/core/spec/view.js").ResolutionBehavior}
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
     * @param {import("@genome-spy/core/data/flowNode.js").Datum} datum
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
 * Extends GridChild with group background and stroke
 */
class SampleGridChild extends GridChild {
    /**
     * @param {View} view
     * @param {ContainerView} layoutParent
     * @param {number} serial
     * @param {import("@genome-spy/core/spec/view.js").ViewBackground} [viewBackgroundSpec]
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
                "sample-group-background-" + serial,
                {
                    blockEncodingInheritance: true,
                }
            );
        }

        const backgroundStrokeSpec = createBackgroundStroke(viewBackgroundSpec);
        if (backgroundStrokeSpec) {
            this.groupBackgroundStroke = new UnitView(
                backgroundStrokeSpec,
                layoutParent.context,
                layoutParent,
                view,
                "sample-group-background-stroke-" + serial,
                {
                    blockEncodingInheritance: true,
                }
            );
        }

        this.summaryViews = new ConcatView(
            {
                configurableVisibility: false,
                resolve: {
                    axis: { x: "shared" },
                    scale: { x: "shared" },
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
