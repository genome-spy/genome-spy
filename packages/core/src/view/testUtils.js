/**
 * Utils for tests
 * TODO: Find a better place and convention
 *
 * @typedef {import("../spec/root.js").RootSpec} RootSpec
 * @typedef {import("../types/viewContext.js").default} ViewContext
 * @typedef {ViewContext & {
 *   emitBroadcast: (
 *     root: import("./view.js").default,
 *     type: import("../genomeSpy.js").BroadcastEventType,
 *     payload?: any
 *   ) => void
 * }} BroadcastingViewContext
 */

import {
    calculateCanvasSize,
    checkForDuplicateScaleNames,
} from "./viewUtils.js";
import {
    initializeViewSubtree,
    loadViewSubtreeData,
} from "../data/flowInit.js";
import { VIEW_ROOT_NAME } from "./viewFactory.js";
import UnitView from "./unitView.js";
import ContainerView from "./containerView.js";
import View from "./view.js";
import Rectangle from "./layout/rectangle.js";
import DebugginViewRenderingContext from "./renderingContext/debuggingViewRenderingContext.js";
import {
    createHeadlessEngine,
    createHeadlessViewContext,
} from "../genomeSpy/headlessBootstrap.js";

/**
 * @param {import("./viewFactory.js").ViewFactoryOptions} [viewFactoryOptions]
 * @returns
 */
export function createTestViewContext(viewFactoryOptions = {}) {
    return createHeadlessViewContext({
        viewFactoryOptions,
    });
}

/**
 * @param {import("./viewFactory.js").ViewFactoryOptions} [viewFactoryOptions]
 * @returns {BroadcastingViewContext}
 */
export function createBroadcastingTestViewContext(viewFactoryOptions = {}) {
    const context = /** @type {BroadcastingViewContext} */ (
        createTestViewContext({
            wrapRoot: true,
            ...viewFactoryOptions,
        })
    );

    /** @type {Map<string, Set<(message: any) => void>>} */
    const listeners = new Map();

    context.addBroadcastListener = (type, listener) => {
        const typedListeners = listeners.get(type) ?? new Set();
        typedListeners.add(listener);
        listeners.set(type, typedListeners);
    };

    context.removeBroadcastListener = (type, listener) => {
        listeners.get(type)?.delete(listener);
    };

    context.emitBroadcast = (root, type, payload) => {
        const message = /** @type {import("./view.js").BroadcastMessage} */ ({
            type,
            payload,
        });
        root.visit((view) => view.handleBroadcast(message));
        for (const listener of listeners.get(type) ?? []) {
            listener(message);
        }
    };

    return context;
}

/**
 * @type {<V extends import("./view.js").default>(spec: RootSpec, viewClass: { new(...args: any[]): V }, ViewFactoryOptions?: import("./viewFactory.js").ViewFactoryOptions) => Promise<V>}
 */
export async function create(spec, viewClass, viewFactoryOptions = {}) {
    const c = createTestViewContext(viewFactoryOptions);
    const view = await c.createOrImportView(
        /** @type {import("../spec/view.js").ViewSpec} */ (spec),
        null,
        null,
        VIEW_ROOT_NAME
    );

    if (!(view instanceof viewClass)) {
        throw new Error("ViewClass and the spec do not match!");
    }

    return view;
}

/**
 * Creates a view and initializes its data. Does not wrap it in an implicit root view.
 *
 * @type {<V extends import("./view.js").default>(spec: RootSpec, viewClass: { new(...args: any[]): V }, context?: ViewContext, options?: {noData: boolean, implicitRoot: boolean}) => Promise<V>}
 */
export async function createAndInitialize(spec, viewClass) {
    const view = await create(spec, viewClass);

    checkForDuplicateScaleNames(view);
    if (view instanceof UnitView) {
        view.mark.initializeEncoders();
    } else if (view instanceof ContainerView) {
        view.visit((v) => {
            if (v instanceof UnitView) {
                v.mark.initializeEncoders();
            }
        });
    }

    const { dataSources } = initializeViewSubtree(view, view.context.dataFlow);
    await loadViewSubtreeData(view, dataSources);
    return view;
}

/**
 * Renders a view hierarchy into a debugging layout tree that records the
 * rendered view coordinates.
 *
 * @param {View} view
 * @param {import("./layout/rectangle.js").default} [coords]
 */
export function renderToLayout(view, coords) {
    const renderingContext = new DebugginViewRenderingContext({});

    const canvasSize = calculateCanvasSize(view);
    const rect =
        coords ??
        Rectangle.create(
            0,
            0,
            canvasSize.width ?? 1500,
            canvasSize.height ?? 1000
        );

    view.render(renderingContext, rect, {
        firstFacet: true,
    });

    return renderingContext.getLayout();
}

/**
 * Creates a wrapped view hierarchy and renders it into a debugging layout tree.
 *
 * @param {RootSpec} spec
 * @param {import("./viewFactory.js").ViewFactoryOptions} [viewFactoryOptions]
 * @param {import("./layout/rectangle.js").default} [coords]
 */
export async function specToLayout(spec, viewFactoryOptions = {}, coords) {
    const view = await create(/** @type {any} */ (spec), View, {
        wrapRoot: true,
        ...viewFactoryOptions,
    });

    return renderToLayout(view, coords);
}

export { createHeadlessEngine };
