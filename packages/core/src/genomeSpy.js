/*
Refactor plan (incremental, behavior-preserving):
- Extract DOM/container setup and loading indicator UI into a small UI helper module.
- Move mouse/interaction handling (including picking + tooltip flow) into an InteractionController.
- Isolate layout/render lifecycle into a RenderCoordinator that owns render contexts and picking buffer.
- Split runtime context construction into a factory that takes explicit dependencies.
- Add an error hook option (onError) so UI messaging can be customized without core DOM coupling.
*/
import { formats as vegaFormats } from "vega-loader";
import { html, render } from "lit";

import { createContainerUi, createMessageBox } from "./utils/ui/containerUi.js";
import LoadingIndicatorManager from "./utils/ui/loadingIndicatorManager.js";
import { createViewHighlighter } from "./utils/ui/viewHighlight.js";
import KeyboardListenerManager from "./utils/keyboardListenerManager.js";
import EventListenerRegistry from "./utils/eventListenerRegistry.js";

import { calculateCanvasSize } from "./view/viewUtils.js";
import { initializeViewData } from "./data/viewDataInit.js";
import UnitView from "./view/unitView.js";

import WebGLHelper, { framebufferToDataUrl } from "./gl/webGLHelper.js";
import Rectangle from "./view/layout/rectangle.js";
import BufferedViewRenderingContext from "./view/renderingContext/bufferedViewRenderingContext.js";
import Animator from "./utils/animator.js";
import DataFlow from "./data/dataFlow.js";
import GenomeStore from "./genome/genomeStore.js";
import BmFontManager from "./fonts/bmFontManager.js";
import fasta from "./data/formats/fasta.js";
import refseqGeneTooltipHandler from "./tooltip/refseqGeneTooltipHandler.js";
import dataTooltipHandler from "./tooltip/dataTooltipHandler.js";
import { invalidatePrefix } from "./utils/propertyCacher.js";
import { VIEW_ROOT_NAME, ViewFactory } from "./view/viewFactory.js";
import createBindingInputs from "./utils/inputBinding.js";
import { createFramebufferInfo } from "twgl.js";
import InteractionController from "./interaction/interactionController.js";
import RenderCoordinator from "./view/renderCoordinator.js";
import { createViewContext } from "./view/viewContextFactory.js";
import { configureViewHierarchy } from "./view/viewHierarchyConfig.js";

/**
 * Events that are broadcasted to all views.
 * @typedef {"dataFlowBuilt" | "layout" | "layoutComputed" | "subtreeDataReady"} BroadcastEventType
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

        /** @type {RenderCoordinator} */
        this._renderCoordinator = undefined;

        /**
         * @type {KeyboardListenerManager}
         */
        this._keyboardListenerManager = new KeyboardListenerManager();

        /**
         * Listers for exposed high-level events such as click on a mark instance.
         * These should probably be in the View class and support bubbling through
         * the hierarchy.
         *
         * @type {EventListenerRegistry}
         */
        this._eventListeners = new EventListenerRegistry();

        /**
         *
         * @type {EventListenerRegistry}
         */
        this._extraBroadcastListeners = new EventListenerRegistry();

        /** @type {Record<string, import("./tooltip/tooltipHandler.js").TooltipHandler>}> */
        this.tooltipHandlers = {
            default: dataTooltipHandler,
            refseqgene: refseqGeneTooltipHandler,
            ...(options.tooltipHandlers ?? {}),
        };

        /** @type {View} */
        this.viewRoot = undefined;

        /**
         * @type {LoadingIndicatorManager}
         */
        this._loadingIndicatorManager = undefined;

        /**
         * @type {HTMLElement}
         */
        this._inputBindingContainer = undefined;

        /** @type {InteractionController} */
        this._interactionController = undefined;

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

        const inputBindingContainer = document.createElement("div");
        inputBindingContainer.className = "gs-input-bindings";
        this._inputBindingContainer = inputBindingContainer;

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
        this._extraBroadcastListeners.emit(type, message);
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
        const {
            canvasWrapper,
            loadingMessageElement,
            loadingIndicatorsElement,
            tooltip,
        } = createContainerUi(this.container);

        this._glHelper = new WebGLHelper(
            canvasWrapper,
            () =>
                this.viewRoot
                    ? calculateCanvasSize(this.viewRoot)
                    : { width: undefined, height: undefined },
            { powerPreference: this.options.powerPreference ?? "default" }
        );

        // The initial loading message that is shown until the first frame is rendered
        this.loadingMessageElement = loadingMessageElement;
        // A container for loading indicators (for lazy data sources.)
        // These could alternatively be included in the view hierarchy,
        // but it's easier this way – particularly if we want to show
        // some fancy animated spinners.
        this.loadingIndicatorsElement = loadingIndicatorsElement;
        this.tooltip = tooltip;
        this._loadingIndicatorManager = new LoadingIndicatorManager(
            loadingIndicatorsElement
        );
    }

    /**
     * Unregisters all listeners, removes all created dom elements, removes all css classes from the container
     */
    destroy() {
        // TODO: There's a memory leak somewhere

        const canvasWrapper = this.#canvasWrapper;

        this.container.classList.remove("genome-spy");
        canvasWrapper.classList.remove("loading");

        this._keyboardListenerManager.removeAll();

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

        /** @type {import("./types/viewContext.js").default} */
        const context = createViewContext({
            dataFlow: new DataFlow(),
            glHelper: this._glHelper,
            animator: this.animator,
            genomeStore: this.genomeStore,
            fontManager: new BmFontManager(this._glHelper),
            updateTooltip: this.updateTooltip.bind(this),
            getNamedDataFromProvider: this.getNamedDataFromProvider.bind(this),
            getCurrentHover: () =>
                this._interactionController.getCurrentHover(),
            setDataLoadingStatus: (view, status, detail) =>
                this._loadingIndicatorManager.setDataLoadingStatus(
                    view,
                    status,
                    detail
                ),
            addKeyboardListener: (type, listener) => {
                // TODO: Listeners should be called only when the mouse pointer is inside the
                // container or the app covers the full document.
                this._keyboardListenerManager.add(type, listener);
            },
            addBroadcastListener: (type, listener) =>
                this._extraBroadcastListeners.add(type, listener),
            removeBroadcastListener: (type, listener) =>
                this._extraBroadcastListeners.remove(type, listener),
            isViewConfiguredVisible: this.viewVisibilityPredicate,
            isViewSpec: (spec) => this.viewFactory.isViewSpec(spec),
            createOrImportViewWithContext: (
                ctx,
                spec,
                layoutParent,
                dataParent,
                defaultName,
                validator
            ) =>
                this.viewFactory.createOrImportView(
                    spec,
                    ctx,
                    layoutParent,
                    dataParent,
                    defaultName,
                    validator
                ),
            highlightView: createViewHighlighter(this.container),
        });

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

        configureViewHierarchy(this.viewRoot);

        // We should now have a complete view hierarchy. Let's update the canvas size
        // and ensure that the loading message is visible.
        this._glHelper.invalidateSize();
        this._renderCoordinator = new RenderCoordinator({
            viewRoot: this.viewRoot,
            glHelper: this._glHelper,
            getBackground: () => this.spec.background,
            broadcast: this.broadcast.bind(this),
            onLayoutComputed: () =>
                this._loadingIndicatorManager.updateLayout(),
        });

        this.#setupDpr();

        await initializeViewData(
            this.viewRoot,
            context.dataFlow,
            context.fontManager,
            (flow) => this.broadcast("dataFlowBuilt", flow)
        );

        // Allow layout computation
        // eslint-disable-next-line require-atomic-updates
        context.requestLayoutReflow = this.computeLayout.bind(this);

        // Invalidate cached sizes to ensure that step-based sizes are current.
        // TODO: This should be done automatically when the domains of band/point scales are updated.
        this.viewRoot.visit((view) => invalidatePrefix(view, "size"));
        this._glHelper.invalidateSize();

        this._interactionController = new InteractionController({
            viewRoot: this.viewRoot,
            glHelper: this._glHelper,
            tooltip: this.tooltip,
            animator: this.animator,
            emitEvent: this._eventListeners.emit.bind(this._eventListeners),
            tooltipHandlers: this.tooltipHandlers,
            renderPickingFramebuffer: this.renderPickingFramebuffer.bind(this),
            getDevicePixelRatio: () => this.dpr,
        });
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
            const handled = this.options.onError?.(reason, this.container);
            if (!handled) {
                createMessageBox(this.container, message);
            }

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
        this._interactionController.registerMouseEvents();
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
        this._interactionController.updateTooltip(datum, converter);
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
        this._renderCoordinator.computeLayout();
    }

    renderAll() {
        this._renderCoordinator.renderAll();
    }

    renderPickingFramebuffer() {
        this._renderCoordinator.renderPickingFramebuffer();
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
