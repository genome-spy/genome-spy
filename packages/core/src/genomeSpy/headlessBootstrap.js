/**
 * Shared helpers for creating a GenomeSpy runtime without DOM or WebGL.
 *
 * @typedef {import("../spec/root.js").RootSpec} RootSpec
 * @typedef {import("../types/viewContext.js").default} ViewContext
 */

import DataFlow from "../data/dataFlow.js";
import GenomeStore from "../genome/genomeStore.js";
import BmFontManager from "../fonts/bmFontManager.js";
import Animator from "../utils/animator.js";
import { INTERNAL_DEFAULT_CONFIG } from "../config/defaultConfig.js";
import { resolveBaseConfig } from "../config/resolveConfig.js";
import { createViewContext } from "./viewContextFactory.js";
import { ViewFactory, VIEW_ROOT_NAME } from "../view/viewFactory.js";
import { ensureAssembliesForView } from "../genome/assemblyPreflight.js";
import {
    configureViewHierarchy,
    configureViewOpacity,
} from "./viewHierarchyConfig.js";
import { initializeViewData } from "./viewDataInit.js";

/**
 * @returns {GenomeStore}
 */
function createTestGenomeStore() {
    const genomeStore = new GenomeStore(".");
    genomeStore.initialize({
        name: "hg38",
    });
    return genomeStore;
}

/**
 * @returns {import("../utils/animator.js").default}
 */
function createHeadlessAnimator() {
    class HeadlessAnimator extends Animator {
        constructor() {
            super(() => undefined);
        }

        requestRender() {
            //
        }

        /**
         * @param {(timestamp: number) => void} callback
         */
        requestTransition(callback) {
            callback(0);
        }

        /**
         * @param {import("../utils/transition.js").TransitionOptions} options
         */
        transition(options) {
            const to = typeof options.to === "number" ? options.to : 1;
            options.onUpdate(to);
            return Promise.resolve();
        }
    }

    return new HeadlessAnimator();
}

/**
 * @param {{
 *   viewFactoryOptions?: import("../view/viewFactory.js").ViewFactoryOptions,
 *   dataFlow?: DataFlow,
 *   genomeStore?: GenomeStore,
 *   fontManager?: BmFontManager,
 *   animator?: import("../utils/animator.js").default,
 *   baseConfig?: ReturnType<typeof resolveBaseConfig>,
 *   getNamedDataFromProvider?: (name: string) => any[] | undefined,
 *   getCurrentHover?: () => any,
 *   updateTooltip?: <T>(datum: T, converter?: (datum: T) => Promise<any>) => void,
 *   requestLayoutReflow?: () => void,
 *   suspendHoverTracking?: () => void,
 *   resumeHoverTracking?: (event?: MouseEvent) => void,
 *   addKeyboardListener?: (
 *     type: "keydown" | "keyup",
 *     listener: (event: KeyboardEvent) => void
 *   ) => void,
 *   addBroadcastListener?: (
 *     type: import("../genomeSpy.js").BroadcastEventType,
 *     listener: (message: import("../view/view.js").BroadcastMessage) => void
 *   ) => void,
 *   removeBroadcastListener?: (
 *     type: import("../genomeSpy.js").BroadcastEventType,
 *     listener: (message: import("../view/view.js").BroadcastMessage) => void
 *   ) => void,
 *   highlightView?: (view: import("../view/view.js").default | null) => void,
 *   isViewConfiguredVisible?: (view: import("../view/view.js").default) => boolean,
 *   isViewSpec?: (spec: any) => boolean,
 *   glHelper?: import("../gl/webGLHelper.js").default,
 * }} [options]
 * @returns {ViewContext}
 */
export function createHeadlessViewContext(options = {}) {
    const viewFactory = new ViewFactory({
        allowImport: false,
        wrapRoot: false,
        ...options.viewFactoryOptions,
    });

    const dataFlow = options.dataFlow ?? new DataFlow();
    const genomeStore = options.genomeStore ?? createTestGenomeStore();
    const baseConfig =
        options.baseConfig ??
        resolveBaseConfig({
            defaultConfig: INTERNAL_DEFAULT_CONFIG,
        });

    return createViewContext({
        allowMissingGlHelper: true,
        dataFlow,
        genomeStore,
        glHelper: options.glHelper,
        fontManager: options.fontManager ?? new BmFontManager(),
        animator: options.animator ?? createHeadlessAnimator(),
        requestLayoutReflow: options.requestLayoutReflow ?? (() => undefined),
        updateTooltip: options.updateTooltip ?? (() => undefined),
        getNamedDataFromProvider:
            options.getNamedDataFromProvider ?? (() => undefined),
        getCurrentHover: options.getCurrentHover ?? (() => undefined),
        suspendHoverTracking: options.suspendHoverTracking ?? (() => undefined),
        resumeHoverTracking: options.resumeHoverTracking ?? (() => undefined),
        addKeyboardListener: options.addKeyboardListener ?? (() => undefined),
        addBroadcastListener: options.addBroadcastListener ?? (() => undefined),
        removeBroadcastListener:
            options.removeBroadcastListener ?? (() => undefined),
        highlightView: options.highlightView ?? (() => undefined),
        isViewConfiguredVisible:
            options.isViewConfiguredVisible ?? (() => true),
        isViewSpec:
            options.isViewSpec ?? viewFactory.isViewSpec.bind(viewFactory),
        getBaseConfig: () => baseConfig,
        createOrImportViewWithContext: (
            context,
            spec,
            layoutParent,
            dataParent,
            defaultName,
            validator,
            createOptions
        ) =>
            viewFactory.createOrImportView(
                spec,
                context,
                layoutParent,
                dataParent,
                defaultName,
                validator,
                createOptions
            ),
    });
}

/**
 * Shared view-hierarchy preparation that does not require a browser shell.
 *
 * @param {import("../view/view.js").default} viewRoot
 */
export function prepareViewHierarchy(viewRoot) {
    configureViewHierarchy(viewRoot);
    configureViewOpacity(viewRoot);
}

/**
 * Creates a real view hierarchy and initializes its dataflow without touching
 * browser-only subsystems such as WebGL or DOM event wiring.
 *
 * @param {RootSpec} spec
 * @param {{
 *   context?: ViewContext,
 *   contextOptions?: Parameters<typeof createHeadlessViewContext>[0],
 *   onDataFlowBuilt?: (dataFlow: DataFlow) => void,
 * }} [options]
 * @returns {Promise<{ view: import("../view/view.js").default, context: ViewContext }>}
 */
export async function createHeadlessEngine(spec, options = {}) {
    const context =
        options.context ?? createHeadlessViewContext(options.contextOptions);

    if (spec.datasets) {
        const getNamedDataFromProvider = context.getNamedDataFromProvider;
        context.getNamedDataFromProvider = (name) =>
            spec.datasets[name] ?? getNamedDataFromProvider(name);
    }

    const view = await context.createOrImportView(
        /** @type {import("../spec/view.js").ViewSpec} */ (spec),
        null,
        null,
        VIEW_ROOT_NAME
    );

    await ensureAssembliesForView(view, context.genomeStore);
    prepareViewHierarchy(view);

    await initializeViewData(
        view,
        context.dataFlow,
        context.fontManager,
        options.onDataFlowBuilt ?? (() => undefined)
    );

    return { view, context };
}
