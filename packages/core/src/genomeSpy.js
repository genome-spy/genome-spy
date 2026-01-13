import { formats as vegaFormats } from "vega-loader";
import { html, nothing, render } from "lit";
import { styleMap } from "lit/directives/style-map.js";
import SPINNER from "./img/90-ring-with-bg.svg";

import css from "./styles/genome-spy.css.js";
import Tooltip from "./utils/ui/tooltip.js";

import {
    checkForDuplicateScaleNames,
    setImplicitScaleNames,
    calculateCanvasSize,
} from "./view/viewUtils.js";
import { syncFlowHandles } from "./data/flowInit.js";
import UnitView from "./view/unitView.js";

import WebGLHelper, {
    framebufferToDataUrl,
    readPickingPixel,
} from "./gl/webGLHelper.js";
import Rectangle from "./view/layout/rectangle.js";
import BufferedViewRenderingContext from "./view/renderingContext/bufferedViewRenderingContext.js";
import CompositeViewRenderingContext from "./view/renderingContext/compositeViewRenderingContext.js";
import InteractionEvent from "./utils/interactionEvent.js";
import Point from "./view/layout/point.js";
import Animator from "./utils/animator.js";
import DataFlow from "./data/dataFlow.js";
import { buildDataFlow } from "./view/flowBuilder.js";
import { optimizeDataFlow } from "./data/flowOptimizer.js";
import GenomeStore from "./genome/genomeStore.js";
import BmFontManager from "./fonts/bmFontManager.js";
import fasta from "./data/formats/fasta.js";
import { VISIT_STOP } from "./view/view.js";
import Inertia, { makeEventTemplate } from "./utils/inertia.js";
import refseqGeneTooltipHandler from "./tooltip/refseqGeneTooltipHandler.js";
import dataTooltipHandler from "./tooltip/dataTooltipHandler.js";
import { invalidatePrefix } from "./utils/propertyCacher.js";
import { VIEW_ROOT_NAME, ViewFactory } from "./view/viewFactory.js";
import { reconfigureScales } from "./view/scaleResolution.js";
import createBindingInputs from "./utils/inputBinding.js";
import { isStillZooming } from "./view/zoom.js";
import { createFramebufferInfo } from "twgl.js";

/**
 * Events that are broadcasted to all views.
 * @typedef {"dataFlowBuilt" | "dataLoaded" | "layout" | "layoutComputed"} BroadcastEventType
 */

vegaFormats("fasta", fasta);

export default class GenomeSpy {
    /**
     * @typedef {import("./view/view.js").default} View
     * @typedef {import("./spec/view.js").ViewSpec} ViewSpec
     * @typedef {import("./spec/root.js").RootSpec} RootSpec
     * @typedef {import("./spec/root.js").RootConfig} RootConfig
     */

    /**
     *
     * @param {HTMLElement} container
     * @param {RootSpec} spec
     * @param {import("./types/embedApi.js").EmbedOptions} [options]
     */
    constructor(container, spec, options = {}) {
        this.container = container;
        this.options = options;

        options.inputBindingContainer ??= "default";

        /** @type {(() => void)[]} */
        this._destructionCallbacks = [];

        /** Root level configuration object */
        this.spec = spec;

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
         * @type {(view: View) => boolean}
         */
        this.viewVisibilityPredicate = (view) => view.isVisibleInSpec();

        /** @type {BufferedViewRenderingContext} */
        this._renderingContext = undefined;
        /** @type {BufferedViewRenderingContext} */
        this._pickingContext = undefined;

        /** Does picking buffer need to be rendered again */
        this._dirtyPickingBuffer = false;

        /**
         * Currently hovered mark and datum
         * @type {{ mark: import("./marks/mark.js").default, datum: import("./data/flowNode.js").Datum, uniqueId: number }}
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

        /**
         *
         * @type {Map<string, Set<(event: any) => void>>}
         */
        this._extraBroadcastListeners = new Map();

        /** @type {Record<string, import("./tooltip/tooltipHandler.js").TooltipHandler>}> */
        this.tooltipHandlers = {
            default: dataTooltipHandler,
            refseqgene: refseqGeneTooltipHandler,
            ...(options.tooltipHandlers ?? {}),
        };

        /** @type {View} */
        this.viewRoot = undefined;

        /**
         * Views that are currently loading data using lazy sources.
         *
         * @type {Map<View, { status: import("./types/viewContext.js").DataLoadingStatus, detail?: string }>}
         */
        this._loadingViews = new Map();

        /**
         * @type {HTMLElement}
         */
        this._inputBindingContainer = undefined;

        /** @type {Point} */
        this._mouseDownCoords = undefined;

        this.dpr = window.devicePixelRatio;
    }

    get #canvasWrapper() {
        return /** @type {HTMLElement} */ (
            this.container.querySelector(".canvas-wrapper")
        );
    }

    #initializeParameterBindings() {
        /** @type {import("lit").TemplateResult[]} */
        const inputs = [];

        this.viewRoot.visit((view) => {
            const mediator = view.paramMediator;
            inputs.push(...createBindingInputs(mediator));
        });
        const ibc = this.options.inputBindingContainer;

        if (!ibc || ibc == "none" || !inputs.length) {
            return;
        }

        this._inputBindingContainer = element("div", {
            className: "gs-input-bindings",
        });

        if (ibc == "default") {
            this.container.appendChild(this._inputBindingContainer);
        } else if (ibc instanceof HTMLElement) {
            ibc.appendChild(this._inputBindingContainer);
        } else {
            throw new Error("Invalid inputBindingContainer");
        }

        if (inputs.length) {
            render(
                html`<div class="gs-input-binding">${inputs}</div>`,
                this._inputBindingContainer
            );
        }
    }

    /**
     *
     * @param {(name: string) => any[]} provider
     */
    registerNamedDataProvider(provider) {
        this.namedDataProviders.unshift(provider);
    }

    /**
     * @param {string} name
     */
    getNamedDataFromProvider(name) {
        for (const provider of this.namedDataProviders) {
            const data = provider(name);
            if (data) {
                return data;
            }
        }
    }

    /**
     *
     * @param {string} name
     * @param {any[]} data
     */
    updateNamedData(name, data) {
        const namedSource =
            this.viewRoot.context.dataFlow.findNamedDataSource(name);
        if (!namedSource) {
            throw new Error("No such named data source: " + name);
        }

        namedSource.dataSource.updateDynamicData(data);
        reconfigureScales(this.viewRoot);

        this.animator.requestRender();
    }

    /**
     * Broadcast a message to all views
     
     * @param {BroadcastEventType} type
     * @param {any} [payload]
     */
    broadcast(type, payload) {
        const message = { type, payload };
        this.viewRoot.visit((view) => view.handleBroadcast(message));
        this._extraBroadcastListeners
            .get(type)
            ?.forEach((listener) => listener(message));
    }

    /**
     * Draw some layers on top of the canvas. It's easier to do fancy spinning
     * animations with html elements than with WebGL.
     */
    _updateLoadingIndicators() {
        /** @type {import("lit").TemplateResult[]} */
        const indicators = [];

        const isSomethingVisible = () =>
            [...this._loadingViews.values()].some(
                (v) => v.status == "loading" || v.status == "error"
            );

        for (const [view, status] of this._loadingViews) {
            const c = view.coords;
            if (c) {
                const style = {
                    left: `${c.x}px`,
                    top: `${c.y}px`,
                    width: `${c.width}px`,
                    height: `${c.height}px`,
                };
                indicators.push(
                    html`<div style=${styleMap(style)}>
                        <div class=${status.status}>
                            ${status.status == "error"
                                ? html`<span
                                      >Loading
                                      failed${status.detail
                                          ? html`: ${status.detail}`
                                          : nothing}</span
                                  >`
                                : html`
                                      <img src="${SPINNER}" alt="" />
                                      <span>Loading...</span>
                                  `}
                        </div>
                    </div>`
                );
            }
        }

        // Do some hacks to stop css animations of the loading indicators.
        // Otherwise they fire animation frames even when their opacity is zero.
        // TODO: Instead of this, replace the animated spinners with static images.
        // Or even better, once more widely supported, use `allow-discrete`
        // https://developer.mozilla.org/en-US/docs/Web/CSS/transition-behavior
        // to enable transition of the display property.
        if (isSomethingVisible()) {
            this.loadingIndicatorsElement.style.display = "block";
        } else {
            // TODO: Clear previous timeout
            setTimeout(() => {
                if (!isSomethingVisible()) {
                    this.loadingIndicatorsElement.style.display = "none";
                }
            }, 3000);
        }

        render(indicators, this.loadingIndicatorsElement);
    }

    #setupDpr() {
        const dprSetter = this.viewRoot.paramMediator.allocateSetter(
            "devicePixelRatio",
            this.dpr
        );

        const resizeCallback = () => {
            this._glHelper.invalidateSize();
            this.dpr = window.devicePixelRatio;
            dprSetter(this.dpr);
            this.computeLayout();
            // Render immediately, without RAF
            this.renderAll();
        };

        if (this.viewRoot.getSize().isGrowing()) {
            // TODO: Size should be observed only if the content is not absolutely sized
            const resizeObserver = new ResizeObserver(resizeCallback);
            resizeObserver.observe(this.container);
            this._destructionCallbacks.push(() => resizeObserver.disconnect());
        }

        /** @type {() => void} */
        let remove = null;

        const updatePixelRatio = () => {
            if (remove != null) {
                remove();
                resizeCallback();
            }
            const media = matchMedia(
                `(resolution: ${window.devicePixelRatio}dppx)`
            );
            media.addEventListener("change", updatePixelRatio);
            remove = () => {
                media.removeEventListener("change", updatePixelRatio);
            };
        };
        updatePixelRatio();

        if (remove) {
            this._destructionCallbacks.push(remove);
        }
    }

    #prepareContainer() {
        this.container.classList.add("genome-spy");

        const styleElement = document.createElement("style");
        styleElement.innerHTML = css;
        this.container.appendChild(styleElement);

        const canvasWrapper = element("div", {
            class: "canvas-wrapper",
        });
        this.container.appendChild(canvasWrapper);

        canvasWrapper.classList.add("loading");

        this._glHelper = new WebGLHelper(
            canvasWrapper,
            () =>
                this.viewRoot
                    ? calculateCanvasSize(this.viewRoot)
                    : { width: undefined, height: undefined },
            { powerPreference: this.options.powerPreference ?? "default" }
        );

        // The initial loading message that is shown until the first frame is rendered
        this.loadingMessageElement = element("div", {
            class: "loading-message",
            innerHTML: `<div class="message">Loading<span class="ellipsis">...</span></div>`,
        });
        canvasWrapper.appendChild(this.loadingMessageElement);

        // A container for loading indicators (for lazy data sources.)
        // These could alternatively be included in the view hierarchy,
        // but it's easier this way – particularly if we want to show
        // some fancy animated spinners.
        this.loadingIndicatorsElement = element("div", {
            class: "loading-indicators",
        });
        canvasWrapper.appendChild(this.loadingIndicatorsElement);

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

        const canvasWrapper = this.#canvasWrapper;

        this.container.classList.remove("genome-spy");
        canvasWrapper.classList.remove("loading");

        for (const [type, listeners] of this._keyboardListeners) {
            for (const listener of listeners) {
                document.removeEventListener(type, listener);
            }
        }

        this._destructionCallbacks.forEach((callback) => callback());

        this._glHelper.finalize();

        this._inputBindingContainer?.remove();

        while (this.container.firstChild) {
            this.container.firstChild.remove();
        }
    }

    async _prepareViewsAndData() {
        if (this.spec.genome) {
            this.genomeStore = new GenomeStore(this.spec.baseUrl);
            await this.genomeStore.initialize(this.spec.genome);
        }

        // eslint-disable-next-line consistent-this
        const self = this;

        /** @type {import("./types/viewContext.js").default} */
        const context = {
            dataFlow: new DataFlow(),
            glHelper: this._glHelper,
            animator: this.animator,
            genomeStore: this.genomeStore,
            fontManager: new BmFontManager(this._glHelper),

            requestLayoutReflow: () => {
                // placeholder
            },
            updateTooltip: this.updateTooltip.bind(this),
            getNamedDataFromProvider: this.getNamedDataFromProvider.bind(this),
            getCurrentHover: () => this._currentHover,

            setDataLoadingStatus: (view, status, detail) => {
                this._loadingViews.set(view, { status, detail });
                this._updateLoadingIndicators();
            },

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

            addBroadcastListener(type, listener) {
                const listenersByType = self._extraBroadcastListeners;

                // Copy-paste code. TODO: Refactor into a helper function.
                let listeners = listenersByType.get(type);
                if (!listeners) {
                    listeners = new Set();
                    listenersByType.set(type, listeners);
                }

                listeners.add(listener);
            },

            removeBroadcastListener(type, listener) {
                const listenersByType = self._extraBroadcastListeners;

                listenersByType.get(type)?.delete(listener);
            },

            isViewConfiguredVisible: self.viewVisibilityPredicate,

            isViewSpec: (spec) => self.viewFactory.isViewSpec(spec),

            createOrImportView: async function (
                spec,
                layoutParent,
                dataParent,
                defaultName,
                validator
            ) {
                return self.viewFactory.createOrImportView(
                    spec,
                    context,
                    layoutParent,
                    dataParent,
                    defaultName,
                    validator
                );
            },

            highlightView: (view) => {
                this.container.querySelector(".view-highlight")?.remove();
                if (view) {
                    const coords = view.coords;
                    if (coords) {
                        const div = document.createElement("div");
                        div.className = "view-highlight";
                        div.style.position = "absolute";
                        div.style.left = coords.x + "px";
                        div.style.top = coords.y + "px";
                        div.style.width = coords.width + "px";
                        div.style.height = coords.height + "px";
                        div.style.border = "1px solid green";
                        div.style.backgroundColor = "rgba(0, 255, 0, 0.1)";
                        div.style.pointerEvents = "none";
                        this.container.appendChild(div);
                    }
                }
            },
        };

        /** @type {ViewSpec & RootConfig} */
        const rootSpec = this.spec;

        if (rootSpec.datasets) {
            this.registerNamedDataProvider((name) => rootSpec.datasets[name]);
        }

        // Create the view hierarchy.
        // This also resolves scales and axes.
        this.viewRoot = await context.createOrImportView(
            rootSpec,
            null,
            null,
            VIEW_ROOT_NAME
        );

        this.#canvasWrapper.style.flexGrow =
            this.viewRoot.getSize().height.grow > 0 ? "1" : "0";

        this.#initializeParameterBindings();

        checkForDuplicateScaleNames(this.viewRoot);

        setImplicitScaleNames(this.viewRoot);

        const views = this.viewRoot.getDescendants();

        // View opacity should be configured after all scales have been resolved.
        // Currently this doesn't work if new views are added dynamically.
        // TODO: Figure out how to handle dynamic view addition/removal nicely.
        views.forEach((view) => view.configureViewOpacity());

        // We should now have a complete view hierarchy. Let's update the canvas size
        // and ensure that the loading message is visible.
        this._glHelper.invalidateSize();
        this.#setupDpr();

        // Collect all unit views to a list because they need plenty of initialization
        const unitViews = /** @type {UnitView[]} */ (
            views.filter((view) => view instanceof UnitView)
        );

        // Build the data flow based on the view hierarchy
        const flow = buildDataFlow(this.viewRoot, context.dataFlow);
        const canonicalBySource = optimizeDataFlow(flow);
        syncFlowHandles(this.viewRoot, canonicalBySource);
        this.broadcast("dataFlowBuilt", flow);

        // Create encoders (accessors, scales and related metadata)
        unitViews.forEach((view) => view.mark.initializeEncoders());

        // Compile shaders, create or load textures, etc.
        const graphicsInitialized = Promise.all(
            unitViews.map((view) => view.mark.initializeGraphics())
        );

        for (const view of unitViews) {
            const observer = (
                /** @type {import("./data/collector.js").default} */ _collector
            ) => {
                view.mark.initializeData();
                try {
                    // Update WebGL buffers
                    view.mark.updateGraphicsData();
                } catch (e) {
                    e.view = view;
                    throw e;
                }
                context.animator.requestRender();
            };
            view.registerDisposer(view.flowHandle.collector.observe(observer));
        }

        // Have to wait until asynchronous font loading is complete.
        // Text mark's geometry builder needs font metrics before data can be
        // converted into geometries.
        // TODO: Make updateGraphicsData async and await font loading there.
        await context.fontManager.waitUntilReady();

        // Find all data sources and initiate loading
        flow.initialize();
        await Promise.all(
            flow.dataSources.map(
                (
                    /** @type {import("./data/sources/dataSource.js").default} */ dataSource
                ) => dataSource.load()
            )
        );

        // Now that all data have been loaded, the domains may need adjusting
        // IMPORTANT TODO: Check that discrete domains and indexers match!!!!!!!!!
        reconfigureScales(this.viewRoot);

        // This event is needed by SampleView so that it can extract the sample ids
        // from the data once they are loaded.
        // TODO: It would be great if this could be attached to the data flow,
        // because now this is somewhat a hack and is incompatible with dynamic data
        // loading in the future.
        this.broadcast("dataLoaded");

        await graphicsInitialized;

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
            this.#prepareContainer();

            await this._prepareViewsAndData();

            this.registerMouseEvents();

            this.computeLayout();
            this.animator.requestRender();

            return true;
        } catch (reason) {
            const message = `${
                reason.view ? `At "${reason.view.getPathString()}": ` : ""
            }${reason.toString()}`;
            console.error(reason.stack);
            createMessageBox(this.container, message);

            return false;
        } finally {
            this.#canvasWrapper.classList.remove("loading");
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

        let lastWheelEvent = performance.now();

        let longPressTriggered = false;

        /** @param {Event} event */
        const listener = (event) => {
            const now = performance.now();
            const wheeling = now - lastWheelEvent < 200;

            if (event instanceof MouseEvent) {
                const rect = canvas.getBoundingClientRect();
                const point = new Point(
                    event.clientX - rect.left - canvas.clientLeft,
                    event.clientY - rect.top - canvas.clientTop
                );

                if (event.type == "mousemove" && !wheeling) {
                    this.tooltip.handleMouseMove(event);
                    this._tooltipUpdateRequested = false;

                    // Disable picking during dragging. Also postpone picking until
                    // the user has stopped zooming as reading pixels from the
                    // picking buffer is slow and ruins smooth animations.
                    if (event.buttons == 0 && !isStillZooming()) {
                        this.renderPickingFramebuffer();
                        this._handlePicking(point.x, point.y);
                    }
                }

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

                if (
                    (event.type == "mousedown" || event.type == "mouseup") &&
                    !isStillZooming()
                ) {
                    // Actually, only needed when clicking on a mark
                    this.renderPickingFramebuffer();
                } else if (event.type == "wheel") {
                    lastWheelEvent = now;
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
                    if (longPressTriggered) {
                        return;
                    }

                    const e = this._currentHover
                        ? {
                              type: event.type,
                              viewPath: this._currentHover.mark.unitView
                                  .getLayoutAncestors()
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

                if (
                    event.type != "click" ||
                    // Suppress click events if the mouse has been dragged
                    this._mouseDownCoords?.subtract(Point.fromMouseEvent(event))
                        .length < 3
                ) {
                    dispatchEvent(event);
                }
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
            "dblclick",
        ].forEach((type) => canvas.addEventListener(type, listener));

        canvas.addEventListener("mousedown", (/** @type {MouseEvent} */ e) => {
            this._mouseDownCoords = Point.fromMouseEvent(e);
            if (this.tooltip.sticky) {
                this.tooltip.sticky = false;
                this.tooltip.clear();
                // A hack to prevent selection if the tooltip is sticky.
                // Let the tooltip be destickified first.
                longPressTriggered = true;
            } else {
                longPressTriggered = false;
            }

            const disableTooltip = () => {
                document.addEventListener(
                    "mouseup",
                    () => this.tooltip.popEnabledState(),
                    { once: true }
                );
                this.tooltip.pushEnabledState(false);
            };

            // Opening context menu or using modifier keys disables the tooltip
            if (e.button == 2 || e.shiftKey || e.ctrlKey || e.metaKey) {
                disableTooltip();
            } else if (this.tooltip.visible) {
                // Make tooltip sticky if the user long-presses
                const timeout = setTimeout(() => {
                    longPressTriggered = true;
                    this.tooltip.sticky = true;
                }, 400);

                const clear = () => clearTimeout(timeout);
                document.addEventListener("mouseup", clear, { once: true });
                document.addEventListener("mousemove", clear, { once: true });
            }
        });

        // Prevent text selections etc while dragging
        canvas.addEventListener("dragstart", (event) =>
            event.stopPropagation()
        );

        canvas.addEventListener("mouseout", () => {
            this.tooltip.clear();
            this._currentHover = null;
        });
    }

    /**
     * @param {number} x
     * @param {number} y
     */
    _handlePicking(x, y) {
        const dpr = this.dpr;
        const pp = readPickingPixel(
            this._glHelper.gl,
            this._glHelper._pickingBufferInfo,
            x * dpr,
            y * dpr
        );

        const uniqueId = pp[0] | (pp[1] << 8) | (pp[2] << 16) | (pp[3] << 24);

        if (uniqueId == 0) {
            this._currentHover = null;
            return;
        }

        if (uniqueId !== this._currentHover?.uniqueId) {
            this._currentHover = null;
        }

        if (!this._currentHover) {
            this.viewRoot.visit((view) => {
                if (view instanceof UnitView) {
                    if (
                        view.mark.isPickingParticipant() &&
                        [...view.facetCoords.values()].some((coords) =>
                            coords.containsPoint(x, y)
                        )
                    ) {
                        const datum = view
                            .getCollector()
                            .findDatumByUniqueId(uniqueId);
                        if (datum) {
                            this._currentHover = {
                                mark: view.mark,
                                datum,
                                uniqueId,
                            };
                        }
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

    /**
     * Returns a PNG data URL of the current canvas.
     *
     * @param {number} [logicalWidth] defaults to canvas width
     * @param {number} [logicalHeight] defaults to canvas height
     * @param {number} [devicePixelRatio] defaults to window.devicePixelRatio
     * @param {string} [clearColor] null for transparent
     * @returns A PNG data Url
     */
    exportCanvas(
        logicalWidth,
        logicalHeight,
        devicePixelRatio,
        clearColor = "white"
    ) {
        const helper = this._glHelper;

        logicalWidth ??= helper.getLogicalCanvasSize().width;
        logicalHeight ??= helper.getLogicalCanvasSize().height;
        devicePixelRatio ??= window.devicePixelRatio ?? 1;

        const gl = helper.gl;

        const width = Math.floor(logicalWidth * devicePixelRatio);
        const height = Math.floor(logicalHeight * devicePixelRatio);

        const framebufferInfo = createFramebufferInfo(
            gl,
            [
                {
                    format: gl.RGBA,
                    type: gl.UNSIGNED_BYTE,
                    minMag: gl.LINEAR,
                    wrap: gl.CLAMP_TO_EDGE,
                },
            ],
            width,
            height
        );

        const renderingContext = new BufferedViewRenderingContext(
            { picking: false },
            {
                webGLHelper: this._glHelper,
                canvasSize: { width: logicalWidth, height: logicalHeight },
                devicePixelRatio,
                clearColor,
                framebufferInfo,
            }
        );

        this.viewRoot.render(
            renderingContext,
            Rectangle.create(0, 0, logicalWidth, logicalHeight)
        );
        renderingContext.render();

        const pngUrl = framebufferToDataUrl(gl, framebufferInfo, "image/png");

        // Clean up
        this.computeLayout();
        this.renderAll();

        return pngUrl;
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

        const commonOptions = {
            webGLHelper: this._glHelper,
            canvasSize,
            devicePixelRatio: window.devicePixelRatio ?? 1,
        };

        this._renderingContext = new BufferedViewRenderingContext(
            { picking: false },
            {
                ...commonOptions,
                clearColor: this.spec.background,
            }
        );
        this._pickingContext = new BufferedViewRenderingContext(
            { picking: true },
            {
                ...commonOptions,
                framebufferInfo: this._glHelper._pickingBufferInfo,
            }
        );

        root.render(
            new CompositeViewRenderingContext(
                this._renderingContext,
                this._pickingContext
            ),
            // Canvas should now be sized based on the root view or the container
            Rectangle.create(0, 0, canvasSize.width, canvasSize.height)
        );

        // The view coordinates may have not been known during the initial data loading.
        // Thus, update them so that possible error messages are shown in the correct place.
        this._updateLoadingIndicators();

        this.broadcast("layoutComputed");
    }

    renderAll() {
        this._renderingContext?.render();

        this._dirtyPickingBuffer = true;
    }

    renderPickingFramebuffer() {
        if (!this._dirtyPickingBuffer) {
            return;
        }

        this._pickingContext.render();
        this._dirtyPickingBuffer = false;
    }

    getSearchableViews() {
        /** @type {UnitView[]} */
        const views = [];
        this.viewRoot.visit((view) => {
            if (view instanceof UnitView && view.getDataAccessor("search")) {
                views.push(view);
            }
        });
        return views;
    }

    getNamedScaleResolutions() {
        /** @type {Map<string, import("./view/scaleResolution.js").default>} */
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

/**
 * @param {string} tag
 * @param {Record<string, any>} attrs
 */
function element(tag, attrs) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (["innerHTML", "innerText", "className"].includes(key)) {
            // @ts-ignore
            el[key] = value;
        }
        el.setAttribute(key, value);
    }
    return el;
}
