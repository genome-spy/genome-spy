import scaleLocus from "./genome/scaleLocus";
import { scale as vegaScale } from "vega-scale";
import { formats as vegaFormats } from "vega-loader";

import "./styles/genome-spy.scss";
import Tooltip from "./utils/ui/tooltip";

import AccessorFactory from "./encoder/accessor";
import {
    resolveScalesAndAxes,
    processImports,
    setImplicitScaleNames,
} from "./view/viewUtils";
import UnitView from "./view/unitView";

import WebGLHelper from "./gl/webGLHelper";
import Rectangle from "./utils/layout/rectangle";
import DeferredViewRenderingContext from "./view/renderingContext/deferredViewRenderingContext";
import CompositeViewRenderingContext from "./view/renderingContext/compositeViewRenderingContext";
import InteractionEvent from "./utils/interactionEvent";
import Point from "./utils/layout/point";
import Animator from "./utils/animator";
import DataFlow from "./data/dataFlow";
import scaleIndex from "./genome/scaleIndex";
import { buildDataFlow } from "./view/flowBuilder";
import { optimizeDataFlow } from "./data/flowOptimizer";
import scaleNull from "./utils/scaleNull";
import GenomeStore from "./genome/genomeStore";
import BmFontManager from "./fonts/bmFontManager";
import fasta from "./data/formats/fasta";
import { VISIT_STOP } from "./view/view";
import Inertia, { makeEventTemplate } from "./utils/inertia";
import refseqGeneTooltipHandler from "./tooltip/refseqGeneTooltipHandler";
import dataTooltipHandler from "./tooltip/dataTooltipHandler";
import { invalidatePrefix } from "./utils/propertyCacher";
import { ViewFactory } from "./view/viewFactory";
import LayerView from "./view/layerView";
import ImplicitRootView from "./view/implicitRootView";

/**
 * @typedef {import("./spec/view").UnitSpec} UnitSpec
 * @typedef {import("./spec/view").ViewSpec} ViewSpec
 * @typedef {import("./spec/view").ImportSpec} ImportSpec
 * @typedef {import("./spec/view").VConcatSpec} TrackSpec
 * @typedef {import("./spec/root").RootSpec} RootSpec
 * @typedef {import("./spec/root").RootConfig} RootConfig
 */

// Register scaleLocus to Vega-Scale.
// Loci are discrete but the scale's domain can be adjusted in a continuous manner.
vegaScale("index", scaleIndex, ["continuous"]);
vegaScale("locus", scaleLocus, ["continuous"]);
vegaScale("null", scaleNull, []);

vegaFormats("fasta", fasta);

export default class GenomeSpy {
    /**
     *
     * @param {HTMLElement} container
     * @param {RootSpec} spec
     * @param {import("./embedApi").EmbedOptions} [options]
     */
    constructor(container, spec, options = {}) {
        this.container = container;

        /** Root level configuration object */
        this.spec = spec;

        this.accessorFactory = new AccessorFactory();
        this.viewFactory = new ViewFactory();

        /** @type {(function(string):object[])[]} */
        this.namedDataProviders = [];

        this.animator = new Animator(() => this.renderAll());

        /** @type {GenomeStore} */
        this.genomeStore = undefined;

        /**
         * View visibility is checked using a predicate that can be overridden
         * for more dynamic visibility management.
         *
         * @type {(view: import("./view/view").default) => boolean}
         */
        this.viewVisibilityPredicate = (view) => view.isVisibleInSpec();

        /** @type {DeferredViewRenderingContext} */
        this._renderingContext = undefined;
        /** @type {DeferredViewRenderingContext} */
        this._pickingContext = undefined;

        /** Does picking buffer need to be rendered again */
        this._dirtyPickingBuffer = false;

        /**
         * Currently hovered mark and datum
         * @type {{ mark: import("./marks/Mark").default, datum: import("./data/flowNode").Datum, uniqueId: number }}
         */
        this._currentHover = undefined;

        this._wheelInertia = new Inertia(this.animator);

        /**
         * Keeping track so that these can be cleaned up upon finalization.
         * @type {Map<string, (function(KeyboardEvent):void)[]>}
         */
        this._keyboardListeners = new Map();

        /**
         * Listers for exposed high-level events such as click on a mark instance.
         * These should probably be in the View class and support bubbling through
         * the hierarchy.
         *
         * @type {Map<string, Set<(event: any) => void>>}
         */
        this._eventListeners = new Map();

        /** @type {Record<string, import("./tooltip/tooltipHandler").TooltipHandler>}> */
        this.tooltipHandlers = {
            default: dataTooltipHandler,
            refseqgene: refseqGeneTooltipHandler,
            ...(options.tooltipHandlers ?? {}),
        };

        /** @type {import("./view/view").default} */
        this.viewRoot = undefined;
    }

    /**
     *
     * @param {(name: string) => any[]} provider
     */
    registerNamedDataProvider(provider) {
        this.namedDataProviders.unshift(provider);
    }

    /**
     *
     * @param {string} name
     */
    getNamedData(name) {
        for (const provider of this.namedDataProviders) {
            const data = provider(name);
            if (data) {
                return data;
            }
        }
    }

    /**
     * Broadcast a message to all views
     *
     * @param {string} type
     * @param {any} [payload]
     */
    broadcast(type, payload) {
        const message = { type, payload };
        this.viewRoot.visit((view) => view.handleBroadcast(message));
    }

    _prepareContainer() {
        this.container.classList.add("genome-spy");
        this.container.classList.add("loading");

        this._glHelper = new WebGLHelper(this.container, () => {
            if (this.viewRoot) {
                const size = this.viewRoot
                    .getSize()
                    .addPadding(this.viewRoot.getOverhang());

                // If a dimension has an absolutely specified size (in pixels), use it for the canvas size.
                // However, if the dimension has a growing component, the canvas should be fit to the
                // container.
                // TODO: Enforce the minimum size (in case of both absolute and growing components).

                /** @param {import("./utils/layout/flexLayout").SizeDef} dim */
                const f = (dim) => (dim.grow > 0 ? undefined : dim.px);
                return {
                    width: f(size.width),
                    height: f(size.height),
                };
            }
        });

        this.loadingMessageElement = document.createElement("div");
        this.loadingMessageElement.className = "loading-message";
        this.loadingMessageElement.innerHTML = `<div class="message">Loading<span class="ellipsis">...</span></div>`;
        this.container.appendChild(this.loadingMessageElement);

        this.tooltip = new Tooltip(this.container);

        this.loadingMessageElement
            .querySelector(".message")
            .addEventListener("transitionend", () => {
                /** @type {HTMLElement} */ (
                    this.loadingMessageElement
                ).style.display = "none";
            });
    }

    /**
     * Unregisters all listeners, removes all created dom elements, removes all css classes from the container
     */
    destroy() {
        // TODO: There's a memory leak somewhere

        this.container.classList.remove("genome-spy");
        this.container.classList.remove("loading");

        for (const [type, listeners] of this._keyboardListeners) {
            for (const listener of listeners) {
                document.removeEventListener(type, listener);
            }
        }

        this._glHelper.finalize();

        while (this.container.firstChild) {
            this.container.firstChild.remove();
        }
    }

    async _prepareViewsAndData() {
        if (this.spec.genome) {
            this.genomeStore = new GenomeStore(this);
            await this.genomeStore.initialize(this.spec.genome);
        }

        // eslint-disable-next-line consistent-this
        const self = this;

        /** @type {import("./view/viewContext").default} */
        const context = {
            dataFlow: new DataFlow(),
            accessorFactory: this.accessorFactory,
            glHelper: this._glHelper,
            animator: this.animator,
            genomeStore: this.genomeStore,
            fontManager: new BmFontManager(this._glHelper),
            requestLayoutReflow: () => {
                // placeholder
            },
            updateTooltip: this.updateTooltip.bind(this),
            getNamedData: this.getNamedData.bind(this),
            getCurrentHover: () => this._currentHover,

            addKeyboardListener: (type, listener) => {
                // TODO: Listeners should be called only when the mouse pointer is inside the
                // container or the app covers the full document.
                document.addEventListener(type, listener);
                let listeners = this._keyboardListeners.get(type);
                if (!listeners) {
                    listeners = [];
                    this._keyboardListeners.set(type, listeners);
                }
                listeners.push(listener);
            },

            isViewVisible: self.viewVisibilityPredicate,

            isViewSpec: (spec) => self.viewFactory.isViewSpec(spec),

            createView: function (spec, parent, defaultName) {
                return self.viewFactory.createView(
                    spec,
                    context,
                    parent,
                    defaultName
                );
            },
        };

        /** @type {import("./spec/view").ViewSpec & RootConfig} */
        const rootSpec = this.spec;

        if (rootSpec.datasets) {
            this.registerNamedDataProvider((name) => rootSpec.datasets[name]);
        }

        // Create the view hierarchy
        this.viewRoot = context.createView(rootSpec, null, "viewRoot");

        // Replace placeholder ImportViews with actual views.
        await processImports(this.viewRoot);

        if (
            this.viewRoot instanceof UnitView ||
            this.viewRoot instanceof LayerView
        ) {
            this.viewRoot = new ImplicitRootView(context, this.viewRoot);
        }

        // Resolve scales, i.e., if possible, pull them towards the root
        resolveScalesAndAxes(this.viewRoot);
        setImplicitScaleNames(this.viewRoot);

        // Wrap unit or layer views that need axes
        //this.viewRoot = addDecorators(this.viewRoot);

        // We should now have a complete view hierarchy. Let's update the canvas size
        // and ensure that the loading message is visible.
        this._glHelper.invalidateSize();

        // Collect all unit views to a list because they need plenty of initialization
        /** @type {UnitView[]} */
        const unitViews = [];
        this.viewRoot.visit((view) => {
            if (view instanceof UnitView) {
                unitViews.push(view);
            }
        });

        // Build the data flow based on the view hierarchy
        const flow = buildDataFlow(this.viewRoot, context.dataFlow);
        optimizeDataFlow(flow);
        this.broadcast("dataFlowBuilt", flow);

        flow.dataSources.forEach((ds) => console.log(ds.subtreeToString()));

        // Create encoders (accessors, scales and related metadata)
        unitViews.forEach((view) => view.mark.initializeEncoders());

        // Compile shaders, create or load textures, etc.
        const graphicsInitialized = Promise.all(
            unitViews.map((view) => view.mark.initializeGraphics())
        );

        for (const view of unitViews) {
            flow.addObserver((collector) => {
                view.mark.initializeData();
                // Update WebGL buffers
                view.mark.updateGraphicsData();
            }, view);
        }

        // Have to wait until asynchronous font loading is complete.
        // Text mark's geometry builder needs font metrics before data can be
        // converted into geometries.
        await context.fontManager.waitUntilReady();

        // Find all data sources and initiate loading
        flow.initialize();
        await Promise.all(
            flow.dataSources.map((dataSource) => dataSource.load())
        );

        // Now that all data have been loaded, the domains may need adjusting
        this.viewRoot.visit((view) => {
            for (const resolution of Object.values(view.resolutions.scale)) {
                // IMPORTANT TODO: Check that discrete domains and indexers match!!!!!!!!!
                resolution.reconfigure();
            }
        });

        // This event is needed by SampleView so that it can extract the sample ids
        // from the data once they are loaded.
        // TODO: It would be great if this could be attached to the data flow,
        // because now this is somewhat a hack and is incompatible with dynamic data
        // loading in the future.
        this.broadcast("dataLoaded");

        await graphicsInitialized;

        this.viewRoot.visit((view) => {
            for (const resolution of Object.values(view.resolutions.scale)) {
                this._glHelper.createRangeTexture(resolution);
            }
        });

        for (const view of unitViews) {
            view.mark.finalizeGraphicsInitialization();
        }

        // Allow layout computation
        // eslint-disable-next-line require-atomic-updates
        context.requestLayoutReflow = this.computeLayout.bind(this);

        // Invalidate cached sizes to ensure that step-based sizes are current.
        // TODO: This should be done automatically when the domains of band/point scales are updated.
        this.viewRoot.visit((view) => invalidatePrefix(view, "size"));
        this._glHelper.invalidateSize();
    }

    /**
     * TODO: Come up with a sensible name. And maybe this should be called at the end of the constructor.
     * @returns {Promise<boolean>} true if the launch was successful
     */
    async launch() {
        try {
            this._prepareContainer();

            await this._prepareViewsAndData();

            this.registerMouseEvents();

            this.computeLayout();
            this.animator.requestRender();

            // Register resize listener after the initial layout computation to prevent
            // incomplete layouts from accidentally polluting any caches related to sizes.
            this._glHelper.addEventListener("resize", () => {
                this.computeLayout();
                // Render immediately, without RAF
                this.renderAll();
            });

            return true;
        } catch (reason) {
            const message = `${
                reason.view ? `At "${reason.view.getPathString()}": ` : ""
            }${reason.toString()}`;
            console.error(reason.stack);
            createMessageBox(this.container, message);

            return false;
        } finally {
            this.container.classList.remove("loading");
            // Transition listener doesn't appear to work on observablehq
            window.setTimeout(() => {
                this.loadingMessageElement.style.display = "none";
            }, 2000);
        }
    }

    registerMouseEvents() {
        const canvas = this._glHelper.canvas;

        // TODO: This function is huge. Refactor this into a separate class
        // that would also contain state-related stuff that currently pollute the
        // GenomeSpy class.

        /** @param {Event} event */
        const listener = (event) => {
            if (event instanceof MouseEvent) {
                if (event.type == "mousemove") {
                    this.tooltip.handleMouseMove(event);
                    this._tooltipUpdateRequested = false;

                    if (event.buttons == 0) {
                        // Disable during dragging
                        this.renderPickingFramebuffer();
                    }
                }

                const rect = canvas.getBoundingClientRect();
                const point = new Point(
                    event.clientX - rect.left - canvas.clientLeft,
                    event.clientY - rect.top - canvas.clientTop
                );

                /**
                 * @param {MouseEvent} event
                 */
                const dispatchEvent = (event) => {
                    this.viewRoot.propagateInteractionEvent(
                        new InteractionEvent(point, event)
                    );

                    if (!this._tooltipUpdateRequested) {
                        this.tooltip.clear();
                    }
                };

                if (event.type != "wheel") {
                    this._wheelInertia.cancel();
                }

                if (event.type == "mousemove") {
                    this._handlePicking(point.x, point.y);
                } else if (
                    event.type == "mousedown" ||
                    event.type == "mouseup"
                ) {
                    this.renderPickingFramebuffer();
                } else if (event.type == "wheel") {
                    this._tooltipUpdateRequested = false;

                    const wheelEvent = /** @type {WheelEvent} */ (event);

                    if (
                        Math.abs(wheelEvent.deltaX) >
                        Math.abs(wheelEvent.deltaY)
                    ) {
                        // If the viewport is panned (horizontally) using the wheel (touchpad),
                        // the picking buffer becomes stale and needs redrawing. However, we
                        // optimize by just clearing the currently hovered item so that snapping
                        // doesn't work incorrectly when zooming in/out.

                        // TODO: More robust solution (handle at higher level such as ScaleResolution's zoom method)
                        this._currentHover = null;

                        this._wheelInertia.cancel();
                    } else {
                        // Vertical wheeling zooms.
                        // We use inertia to generate fake wheel events for smoother zooming

                        const template = makeEventTemplate(wheelEvent);

                        this._wheelInertia.setMomentum(
                            wheelEvent.deltaY * (wheelEvent.deltaMode ? 80 : 1),
                            (delta) => {
                                const e = new WheelEvent("wheel", {
                                    ...template,
                                    deltaMode: 0,
                                    deltaX: 0,
                                    deltaY: delta,
                                });
                                dispatchEvent(e);
                            }
                        );

                        wheelEvent.preventDefault();
                        return;
                    }
                }

                // TODO: Should be handled at the view level, not globally
                if (event.type == "click") {
                    const e = this._currentHover
                        ? {
                              type: event.type,
                              viewPath: [
                                  ...this._currentHover.mark.unitView.getAncestors(),
                              ]
                                  .map((view) => view.name)
                                  .reverse(),
                              datum: this._currentHover.datum,
                          }
                        : {
                              type: event.type,
                              viewPath: null,
                              datum: null,
                          };

                    this._eventListeners
                        .get("click")
                        ?.forEach((listener) => listener(e));
                }

                dispatchEvent(event);
            }
        };

        [
            "mousedown",
            "mouseup",
            "wheel",
            "click",
            "mousemove",
            "gesturechange",
            "contextmenu",
        ].forEach((type) => canvas.addEventListener(type, listener));

        canvas.addEventListener("mousedown", () => {
            document.addEventListener(
                "mouseup",
                () => this.tooltip.popEnabledState(),
                { once: true }
            );
            this.tooltip.pushEnabledState(false);
        });

        // Prevent text selections etc while dragging
        canvas.addEventListener("dragstart", (event) =>
            event.stopPropagation()
        );
    }

    /**
     * @param {number} x
     * @param {number} y
     */
    _handlePicking(x, y) {
        const pixelValue = this._glHelper.readPickingPixel(x, y);

        const uniqueId =
            pixelValue[0] | (pixelValue[1] << 8) | (pixelValue[2] << 16);

        if (uniqueId == 0) {
            this._currentHover = null;
            return;
        }

        if (uniqueId !== this._currentHover?.uniqueId) {
            this._currentHover = null;
        }

        if (!this._currentHover) {
            // We are doing an exhaustive search of the data. This is a bit slow with
            // millions of items.
            // TODO: Optimize by indexing or something

            this.viewRoot.visit((view) => {
                if (view instanceof UnitView) {
                    if (view.mark.isPickingParticipant()) {
                        const accessor = view.mark.encoders.uniqueId.accessor;
                        view.getCollector().visitData((d) => {
                            if (accessor(d) == uniqueId) {
                                this._currentHover = {
                                    mark: view.mark,
                                    datum: d,
                                    uniqueId,
                                };
                            }
                        });
                    }
                    if (this._currentHover) {
                        return VISIT_STOP;
                    }
                }
            });
        }

        if (this._currentHover) {
            const mark = this._currentHover.mark;
            this.updateTooltip(this._currentHover.datum, async (datum) => {
                if (!mark.isPickingParticipant()) {
                    return;
                }

                const tooltipProps = mark.properties.tooltip;

                if (tooltipProps !== null) {
                    const handlerName = tooltipProps?.handler ?? "default";
                    const handler = this.tooltipHandlers[handlerName];
                    if (!handler) {
                        throw new Error(
                            "No such tooltip handler: " + handlerName
                        );
                    }

                    return handler(datum, mark, tooltipProps?.params);
                }
            });
        }
    }

    /**
     * This method should be called in a mouseMove handler. If not called, the
     * tooltip will be hidden.
     *
     * @param {T} datum
     * @param {function(T):Promise<string | HTMLElement | import("lit").TemplateResult>} [converter]
     * @template T
     */
    updateTooltip(datum, converter) {
        if (!this._tooltipUpdateRequested || !datum) {
            this.tooltip.updateWithDatum(datum, converter);
            this._tooltipUpdateRequested = true;
        } else {
            throw new Error(
                "Tooltip has already been updated! Duplicate event handler?"
            );
        }
    }

    computeLayout() {
        const root = this.viewRoot;
        if (!root) {
            return;
        }

        this.broadcast("layout");

        const canvasSize = this._glHelper.getLogicalCanvasSize();

        if (isNaN(canvasSize.width) || isNaN(canvasSize.height)) {
            // TODO: Figure out what causes this
            console.log(
                `NaN in canvas size: ${canvasSize.width}x${canvasSize.height}. Skipping computeLayout().`
            );
            return;
        }

        this._renderingContext = new DeferredViewRenderingContext(
            {
                picking: false,
            },
            this._glHelper
        );
        this._pickingContext = new DeferredViewRenderingContext(
            {
                picking: true,
            },
            this._glHelper
        );

        root.render(
            new CompositeViewRenderingContext(
                this._renderingContext,
                this._pickingContext
            ),
            // Canvas should now be sized based on the root view or the container
            Rectangle.create(0, 0, canvasSize.width, canvasSize.height)
        );

        this.broadcast("layoutComputed");
    }

    renderAll() {
        this._renderingContext?.renderDeferred();

        this._dirtyPickingBuffer = true;
    }

    renderPickingFramebuffer() {
        if (!this._dirtyPickingBuffer) {
            return;
        }

        this._pickingContext.renderDeferred();
        this._dirtyPickingBuffer = false;
    }

    getSearchableViews() {
        /** @type {UnitView[]} */
        const views = [];
        this.viewRoot.visit((view) => {
            if (view instanceof UnitView && view.getAccessor("search")) {
                views.push(view);
            }
        });
        return views;
    }

    getNamedScaleResolutions() {
        /** @type {Map<string, import("./view/scaleResolution").default>} */
        const resolutions = new Map();
        this.viewRoot.visit((view) => {
            for (const resolution of Object.values(view.resolutions.scale)) {
                if (resolution.name) {
                    resolutions.set(resolution.name, resolution);
                }
            }
        });
        return resolutions;
    }
}

/**
 *
 * @param {HTMLElement} container
 * @param {string} message
 */
function createMessageBox(container, message) {
    // Uh, need a templating thingy
    const messageBox = document.createElement("div");
    messageBox.className = "message-box";
    const messageText = document.createElement("div");
    messageText.textContent = message;
    messageBox.appendChild(messageText);
    container.appendChild(messageBox);
}
