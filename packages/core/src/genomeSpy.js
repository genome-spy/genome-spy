import { formats as vegaFormats } from "vega-loader";

import {
    createContainerUi,
    createMessageBox,
} from "./genomeSpy/containerUi.js";
import LoadingIndicatorManager from "./genomeSpy/loadingIndicatorManager.js";
import LoadingStatusRegistry from "./genomeSpy/loadingStatusRegistry.js";
import { createViewHighlighter } from "./genomeSpy/viewHighlight.js";
import KeyboardListenerManager from "./genomeSpy/keyboardListenerManager.js";
import EventListenerRegistry from "./genomeSpy/eventListenerRegistry.js";
import InputBindingManager from "./genomeSpy/inputBindingManager.js";

import { calculateCanvasSize } from "./view/viewUtils.js";
import {
    initializeViewData,
    initializeVisibleViewData,
} from "./genomeSpy/viewDataInit.js";
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
import { validateSelectorConstraints } from "./view/viewSelectors.js";
import parquet from "./data/formats/parquet.js";
import bed from "./data/formats/bed.js";
import bedpe from "./data/formats/bedpe.js";
import SingleAxisWindowedSource from "./data/sources/lazy/singleAxisWindowedSource.js";
import { ensureAssembliesForView } from "./genome/assemblyPreflight.js";
import { resolveRootGenomeConfig } from "./genome/rootGenomeConfig.js";
import { awaitSubtreeLazyReady } from "./view/dataReadiness.js";

/**
 * Events that are broadcasted to all views.
 * @typedef {"dataFlowBuilt" | "layout" | "layoutComputed" | "subtreeDataReady"} BroadcastEventType
 */

vegaFormats("fasta", fasta);
vegaFormats("parquet", parquet);
vegaFormats("bed", bed);
vegaFormats("bedpe", bedpe);

export default class GenomeSpy {
    /** @type {(() => void)[]} */
    #destructionCallbacks = [];
    /** @type {RenderCoordinator} */
    #renderCoordinator;
    /** @type {LoadingIndicatorManager} */
    #loadingIndicatorManager;
    /** @type {LoadingStatusRegistry} */
    #loadingStatusRegistry;
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
        this.dpr = this.#glHelper.getDevicePixelRatio();

        const dprSetter = this.viewRoot.paramRuntime.allocateSetter(
            "devicePixelRatio",
            this.dpr
        );

        const resizeCallback = () => {
            this.#glHelper.invalidateSize();
            this.dpr = this.#glHelper.getDevicePixelRatio();
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
        const { canvasWrapper, loadingIndicatorsElement, tooltip } =
            createContainerUi(this.container);

        this.#glHelper = new WebGLHelper(
            canvasWrapper,
            () =>
                this.viewRoot
                    ? calculateCanvasSize(this.viewRoot)
                    : { width: undefined, height: undefined },
            { powerPreference: this.options.powerPreference ?? "default" }
        );

        canvasWrapper.appendChild(loadingIndicatorsElement);

        this.tooltip = tooltip;
        this.#loadingStatusRegistry = new LoadingStatusRegistry();
        this.#loadingIndicatorManager = new LoadingIndicatorManager(
            loadingIndicatorsElement,
            this.#loadingStatusRegistry
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

        this.#loadingIndicatorManager.destroy();

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
        this.genomeStore = new GenomeStore(this.spec.baseUrl);

        const { genomesByName, defaultAssembly, deprecationWarning } =
            resolveRootGenomeConfig(this.spec);
        this.genomeStore.configureGenomes(genomesByName, defaultAssembly);

        if (deprecationWarning) {
            // eslint-disable-next-line no-console
            console.warn(deprecationWarning);
        }
    }

    #createViewContext() {
        const dataFlow = new DataFlow();
        dataFlow.loadingStatusRegistry = this.#loadingStatusRegistry;

        return createViewContext({
            dataFlow,
            glHelper: this.#glHelper,
            animator: this.animator,
            genomeStore: this.genomeStore,
            fontManager: new BmFontManager(this.#glHelper),
            updateTooltip: this.updateTooltip.bind(this),
            getNamedDataFromProvider: this.getNamedDataFromProvider.bind(this),
            getCurrentHover: () =>
                this.#interactionController.getCurrentHover(),
            addKeyboardListener: (type, listener) => {
                this.#keyboardListenerManager.add(type, (event) => {
                    if (this.#shouldDispatchKeyboardEvent(type, event)) {
                        listener(event);
                    }
                });
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
     * Scopes keydown events to the active embed (focused container or hovered container).
     * Keyup is always dispatched so key-state machines can reliably release keys.
     *
     * @param {"keydown" | "keyup"} type
     * @param {KeyboardEvent} event
     */
    #shouldDispatchKeyboardEvent(type, event) {
        if (type === "keyup") {
            return true;
        }

        const activeElement = document.activeElement;
        if (activeElement && activeElement !== document.body) {
            return this.container.contains(activeElement);
        } else {
            return this.container.matches(":hover");
        }
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

        // Reminder: assemblies must be ensured after view creation (imports and
        // inheritance resolved), but before any code path that may touch scales
        // (e.g. step-based sizes, dynamic opacity, encoder initialization).
        await ensureAssembliesForView(this.viewRoot, this.genomeStore);

        this.#loadingStatusRegistry.set(this.viewRoot, "loading");

        this.#canvasWrapper.style.flexGrow =
            this.viewRoot.getSize().height.grow > 0 ? "1" : "0";

        this.#initializeParameterBindings();

        configureViewHierarchy(this.viewRoot);
        configureViewOpacity(this.viewRoot);
        this.#logSelectorConstraintWarnings();

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

        // Allow early layout requests from view subscriptions created during initialization.
        // Layout will be recomputed anyway once launch completes.
        context.requestLayoutReflow = this.computeLayout.bind(this);

        this.#setupDpr();
    }

    #logSelectorConstraintWarnings() {
        const issues = validateSelectorConstraints(this.viewRoot);
        if (!issues.length) {
            return;
        }

        for (const issue of issues) {
            console.warn("Selector constraints warning:", issue.message);
        }
    }

    /**
     * @param {import("./types/viewContext.js").default} context
     */
    #finalizeViewInitialization(context) {
        // Allow layout computation (in case a custom context overrode the early assignment).
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
        let launched = false;
        try {
            this.#prepareContainer();

            await this.#prepareViewsAndData();

            this.#interactionController.registerInteractionEvents();

            this.computeLayout();
            this.animator.requestRender();

            launched = true;
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

            if (this.viewRoot) {
                this.#loadingStatusRegistry.set(
                    this.viewRoot,
                    "error",
                    message
                );
            }

            return false;
        } finally {
            this.#canvasWrapper.classList.remove("loading");
            if (launched && this.viewRoot) {
                this.#loadingStatusRegistry.set(this.viewRoot, "complete");
            }
        }
    }

    async initializeVisibleViewData() {
        if (!this.viewRoot) {
            return;
        }

        await initializeVisibleViewData(
            this.viewRoot,
            this.viewRoot.context.dataFlow,
            this.viewRoot.context.fontManager
        );

        // Visibility toggles can change sizes; ensure layout is recomputed even
        // when callers don't explicitly request it.
        this.viewRoot._invalidateCacheByPrefix("size", "progeny");
        this.#glHelper.invalidateSize();
        this.computeLayout();
        this.animator.requestRender();
    }

    /**
     * Waits until lazy sources under the root view have loaded data for the
     * current visible positional domain.
     *
     * @param {AbortSignal} [signal]
     */
    async awaitVisibleLazyData(signal) {
        if (!this.viewRoot) {
            return;
        }

        await awaitSubtreeLazyReady(
            this.viewRoot.context,
            this.viewRoot,
            undefined,
            signal,
            (view) =>
                view.isConfiguredVisible() &&
                view.getDataSource?.() instanceof SingleAxisWindowedSource
        );
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

    getRenderedBounds() {
        /** @type {{ width: number | undefined, height: number | undefined }} */
        const bounds = {
            width: undefined,
            height: undefined,
        };

        this.viewRoot.visit((view) => {
            for (const coords of view.facetCoords.values()) {
                bounds.width = Math.max(bounds.width ?? 0, coords.x2);
                bounds.height = Math.max(bounds.height ?? 0, coords.y2);
            }
        });

        return bounds;
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
            if (
                view instanceof UnitView &&
                view.getSearchAccessors().length > 0
            ) {
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
