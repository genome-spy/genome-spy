import { formats as vegaFormats } from "vega-loader";

import {
    createContainerUi,
    createMessageBox,
} from "./genomeSpy/containerUi.js";
import LoadingIndicatorManager from "./genomeSpy/loadingIndicatorManager.js";
import { createViewHighlighter } from "./genomeSpy/viewHighlight.js";
import KeyboardListenerManager from "./genomeSpy/keyboardListenerManager.js";
import EventListenerRegistry from "./genomeSpy/eventListenerRegistry.js";
import InputBindingManager from "./genomeSpy/inputBindingManager.js";

import { calculateCanvasSize } from "./view/viewUtils.js";
import { initializeViewData } from "./genomeSpy/viewDataInit.js";
import UnitView from "./view/unitView.js";

import WebGLHelper from "./gl/webGLHelper.js";
import Animator from "./utils/animator.js";
import DataFlow from "./data/dataFlow.js";
import GenomeStore from "./genome/genomeStore.js";
import BmFontManager from "./fonts/bmFontManager.js";
import fasta from "./data/formats/fasta.js";
import refseqGeneTooltipHandler from "./tooltip/refseqGeneTooltipHandler.js";
import dataTooltipHandler from "./tooltip/dataTooltipHandler.js";
import { invalidatePrefix } from "./utils/propertyCacher.js";
import { VIEW_ROOT_NAME, ViewFactory } from "./view/viewFactory.js";
import InteractionController from "./genomeSpy/interactionController.js";
import RenderCoordinator from "./genomeSpy/renderCoordinator.js";
import { createViewContext } from "./genomeSpy/viewContextFactory.js";
import {
    configureViewHierarchy,
    configureViewOpacity,
} from "./genomeSpy/viewHierarchyConfig.js";
import { exportCanvas } from "./genomeSpy/canvasExport.js";

/**
 * Events that are broadcasted to all views.
 * @typedef {"dataFlowBuilt" | "layout" | "layoutComputed" | "subtreeDataReady"} BroadcastEventType
 */

vegaFormats("fasta", fasta);

export default class GenomeSpy {
    /** @type {(() => void)[]} */
    #destructionCallbacks = [];
    /** @type {RenderCoordinator} */
    #renderCoordinator;
    /** @type {LoadingIndicatorManager} */
    #loadingIndicatorManager;
    /** @type {InputBindingManager} */
    #inputBindingManager;
    /** @type {InteractionController} */
    #interactionController;
    /** @type {WebGLHelper} */
    #glHelper;

    #keyboardListenerManager = new KeyboardListenerManager();
    #eventListeners = new EventListenerRegistry();
    #extraBroadcastListeners = new EventListenerRegistry();

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

        /** @type {Record<string, import("./tooltip/tooltipHandler.js").TooltipHandler>}> */
        this.tooltipHandlers = {
            default: dataTooltipHandler,
            refseqgene: refseqGeneTooltipHandler,
            ...(options.tooltipHandlers ?? {}),
        };

        /** @type {View} */
        this.viewRoot = undefined;

        this.#inputBindingManager = new InputBindingManager(container, options);

        this.dpr = window.devicePixelRatio;
    }

    get #canvasWrapper() {
        return /** @type {HTMLElement} */ (
            this.container.querySelector(".canvas-wrapper")
        );
    }

    #initializeParameterBindings() {
        this.#inputBindingManager.initialize(this.viewRoot);
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
     * @param {string} type
     * @param {(event: any) => void} listener
     */
    addEventListener(type, listener) {
        this.#eventListeners.add(type, listener);
    }

    /**
     * @param {string} type
     * @param {(event: any) => void} listener
     */
    removeEventListener(type, listener) {
        this.#eventListeners.remove(type, listener);
    }

    /**
     * Broadcast a message to all views
     
     * @param {BroadcastEventType} type
     * @param {any} [payload]
     */
    broadcast(type, payload) {
        const message = { type, payload };
        this.viewRoot.visit((view) => view.handleBroadcast(message));
        this.#extraBroadcastListeners.emit(type, message);
    }

    #setupDpr() {
        const dprSetter = this.viewRoot.paramMediator.allocateSetter(
            "devicePixelRatio",
            this.dpr
        );

        const resizeCallback = () => {
            this.#glHelper.invalidateSize();
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
            this.#destructionCallbacks.push(() => resizeObserver.disconnect());
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
            this.#destructionCallbacks.push(remove);
        }
    }

    #prepareContainer() {
        const {
            canvasWrapper,
            loadingMessageElement,
            loadingIndicatorsElement,
            tooltip,
        } = createContainerUi(this.container);

        this.#glHelper = new WebGLHelper(
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
        this.#loadingIndicatorManager = new LoadingIndicatorManager(
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

        this.#keyboardListenerManager.removeAll();

        this.#destructionCallbacks.forEach((callback) => callback());

        this.#glHelper.finalize();

        this.#inputBindingManager.remove();

        while (this.container.firstChild) {
            this.container.firstChild.remove();
        }
    }

    async #prepareViewsAndData() {
        await this.#initializeGenomeStore();
        const context = this.#createViewContext();
        await this.#initializeViewHierarchy(context);
        await initializeViewData(
            this.viewRoot,
            context.dataFlow,
            context.fontManager,
            (flow) => this.broadcast("dataFlowBuilt", flow)
        );
        this.#finalizeViewInitialization(context);
    }

    async #initializeGenomeStore() {
        if (this.spec.genome) {
            this.genomeStore = new GenomeStore(this.spec.baseUrl);
            await this.genomeStore.initialize(this.spec.genome);
        }
    }

    #createViewContext() {
        return createViewContext({
            dataFlow: new DataFlow(),
            glHelper: this.#glHelper,
            animator: this.animator,
            genomeStore: this.genomeStore,
            fontManager: new BmFontManager(this.#glHelper),
            updateTooltip: this.updateTooltip.bind(this),
            getNamedDataFromProvider: this.getNamedDataFromProvider.bind(this),
            getCurrentHover: () =>
                this.#interactionController.getCurrentHover(),
            setDataLoadingStatus: (view, status, detail) =>
                this.#loadingIndicatorManager.setDataLoadingStatus(
                    view,
                    status,
                    detail
                ),
            addKeyboardListener: (type, listener) => {
                // TODO: Listeners should be called only when the mouse pointer is inside the
                // container or the app covers the full document.
                this.#keyboardListenerManager.add(type, listener);
            },
            addBroadcastListener: (type, listener) =>
                this.#extraBroadcastListeners.add(type, listener),
            removeBroadcastListener: (type, listener) =>
                this.#extraBroadcastListeners.remove(type, listener),
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
    }

    /**
     * @param {import("./types/viewContext.js").default} context
     */
    async #initializeViewHierarchy(context) {
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
        configureViewOpacity(this.viewRoot);

        // We should now have a complete view hierarchy. Let's update the canvas size
        // and ensure that the loading message is visible.
        this.#glHelper.invalidateSize();
        this.#renderCoordinator = new RenderCoordinator({
            viewRoot: this.viewRoot,
            glHelper: this.#glHelper,
            getBackground: () => this.spec.background,
            broadcast: this.broadcast.bind(this),
            onLayoutComputed: () =>
                this.#loadingIndicatorManager.updateLayout(),
        });

        this.#setupDpr();
    }

    /**
     * @param {import("./types/viewContext.js").default} context
     */
    #finalizeViewInitialization(context) {
        // Allow layout computation
        // eslint-disable-next-line require-atomic-updates
        context.requestLayoutReflow = this.computeLayout.bind(this);

        // Invalidate cached sizes to ensure that step-based sizes are current.
        // TODO: This should be done automatically when the domains of band/point scales are updated.
        this.viewRoot.visit((view) => invalidatePrefix(view, "size"));
        this.#glHelper.invalidateSize();

        this.#interactionController = new InteractionController({
            viewRoot: this.viewRoot,
            glHelper: this.#glHelper,
            tooltip: this.tooltip,
            animator: this.animator,
            emitEvent: this.#eventListeners.emit.bind(this.#eventListeners),
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

            await this.#prepareViewsAndData();

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
        this.#interactionController.registerMouseEvents();
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
        this.#interactionController.updateTooltip(datum, converter);
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
        const pngUrl = exportCanvas({
            glHelper: this.#glHelper,
            viewRoot: this.viewRoot,
            logicalWidth,
            logicalHeight,
            devicePixelRatio,
            clearColor,
        });

        // Clean up
        this.computeLayout();
        this.renderAll();

        return pngUrl;
    }

    getLogicalCanvasSize() {
        return this.#glHelper.getLogicalCanvasSize();
    }

    computeLayout() {
        this.#renderCoordinator.computeLayout();
    }

    renderAll() {
        this.#renderCoordinator.renderAll();
    }

    renderPickingFramebuffer() {
        this.#renderCoordinator.renderPickingFramebuffer();
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
        /** @type {Map<string, import("./scales/scaleResolution.js").default>} */
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
