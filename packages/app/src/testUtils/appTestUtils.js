import ConcatView from "@genome-spy/core/view/concatView.js";
import { createTestViewContext } from "@genome-spy/core/view/testUtils.js";
import { initializeViewSubtree } from "@genome-spy/core/data/flowInit.js";

import setupStore from "../state/setupStore.js";
import IntentExecutor from "../state/intentExecutor.js";
import Provenance from "../state/provenance.js";
import SampleView from "../sampleView/sampleView.js";
import CompositeAttributeInfoSource from "../sampleView/compositeAttributeInfoSource.js";

/**
 * @typedef {import("@genome-spy/core/types/viewContext.js").default} ViewContext
 * @typedef {import("@genome-spy/app/spec/sampleView.js").SampleSpec} SampleSpec
 * @typedef {ReturnType<setupStore>} AppStore
 * @typedef {object} StoreStub
 * @prop {() => any} getState
 * @prop {(listener: () => void) => () => void} subscribe
 * @prop {() => number} getListenerCount
 * @prop {(nextState: any) => void} setState
 * @typedef {object} SampleHierarchyStub
 * @prop {{ attributeNames: string[], attributeDefs: Record<string, any>, entities: Record<string, any> }} sampleMetadata
 * @prop {{ entities: Record<string, { indexNumber: number }> }} sampleData
 * @typedef {import("@genome-spy/core/view/concatView.js").default & {
 *   spec: { samples: import("@genome-spy/app/spec/sampleView.js").SampleDef },
 *   sampleHierarchy: SampleHierarchyStub,
 *   compositeAttributeInfoSource: { addAttributeInfoSource: (name: string, resolver: (attribute: any) => any) => void, removeAttributeInfoSource: (name: string, resolver?: (attribute: any) => any) => void, attributeInfoSourcesByType: Record<string, any> },
 *   provenance: { store: StoreStub, getPresentState: () => any },
 *   locationManager: { clipBySummary: (coords: import("@genome-spy/core/view/layout/rectangle.js").default) => import("@genome-spy/core/view/layout/rectangle.js").default },
 *   findSampleForMouseEvent: (coords: import("@genome-spy/core/view/layout/rectangle.js").default, event: any) => any,
 *   makePeekMenuItem: () => any,
 *   actions: { filterByNominal: any },
 *   dispatchAttributeAction: (action: any) => void,
 * }} SampleViewStub
 */

/**
 * @param {{ context?: ViewContext }} [options]
 */
export function createAppTestContext(options = {}) {
    const context = options.context ?? createTestViewContext();
    const store = setupStore();
    const intentExecutor = new IntentExecutor(store);
    const provenance = new Provenance(store);

    context.animator =
        /** @type {import("@genome-spy/core/utils/animator.js").default} */ (
            /** @type {any} */ ({
                transition: /** @type {() => Promise<void>} */ (
                    () => Promise.resolve()
                ),
                requestRender: /** @type {() => void} */ (() => undefined),
            })
        );
    context.requestLayoutReflow = () => undefined;
    context.updateTooltip = () => undefined;
    context.getCurrentHover = () => undefined;
    context.addKeyboardListener = () => undefined;
    context.addBroadcastListener = () => undefined;
    context.removeBroadcastListener = () => undefined;
    context.glHelper = undefined;

    return {
        context,
        store,
        provenance,
        intentExecutor,
    };
}

/**
 * @param {any} initialState
 * @returns {StoreStub}
 */
export function createStoreStub(initialState) {
    let state = initialState;
    /** @type {Set<() => void>} */
    const listeners = new Set();

    return {
        getState: () => state,
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        getListenerCount: () => listeners.size,
        setState: (nextState) => {
            state = nextState;
            for (const listener of Array.from(listeners)) {
                listener();
            }
        },
    };
}

/**
 * @param {{
 *   context: ViewContext,
 *   store: StoreStub,
 *   sampleHierarchy: SampleHierarchyStub,
 * }} options
 * @returns {SampleViewStub}
 */
export function createSampleViewStub(options) {
    const view = new ConcatView(
        { hconcat: [] },
        options.context,
        null,
        null,
        "sample"
    );

    const sampleView = /** @type {SampleViewStub} */ (view);

    sampleView.spec = {
        ...view.spec,
        samples:
            /** @type {import("@genome-spy/app/spec/sampleView.js").SampleDef} */ ({}),
    };
    sampleView.sampleHierarchy = options.sampleHierarchy;
    sampleView.compositeAttributeInfoSource =
        new CompositeAttributeInfoSource();
    sampleView.provenance = {
        store: options.store,
        getPresentState: () => ({}),
    };
    sampleView.locationManager = {
        /** @type {(coords: import("@genome-spy/core/view/layout/rectangle.js").default) => import("@genome-spy/core/view/layout/rectangle.js").default} */
        clipBySummary: (coords) => coords,
    };
    sampleView.findSampleForMouseEvent = () => undefined;
    sampleView.makePeekMenuItem = () => ({});
    sampleView.actions = { filterByNominal: () => ({}) };
    sampleView.dispatchAttributeAction = () => undefined;

    return sampleView;
}

/**
 * @param {{
 *   spec: SampleSpec,
 *   context?: ViewContext,
 *   initializeFlow?: boolean,
 *   disableGroupUpdates?: boolean,
 * }} options
 * @returns {Promise<{ view: SampleView, context: ViewContext, store: AppStore }>}
 */
export async function createSampleViewForTest(options) {
    const { context, store, provenance, intentExecutor } = createAppTestContext(
        {
            context: options.context,
        }
    );

    const view = new SampleView(
        options.spec,
        context,
        null,
        null,
        "samples",
        provenance,
        intentExecutor
    );

    await view.initializeChildren();

    if (options.initializeFlow ?? true) {
        initializeViewSubtree(view, context.dataFlow);
    }

    if (options.disableGroupUpdates) {
        view.sampleGroupView.updateGroups = () => undefined;
    }

    return { view, context, store };
}
