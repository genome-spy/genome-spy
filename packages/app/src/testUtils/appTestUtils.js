import { createTestViewContext } from "@genome-spy/core/view/testUtils.js";
import { initializeViewSubtree } from "@genome-spy/core/data/flowInit.js";

import setupStore from "../state/setupStore.js";
import IntentExecutor from "../state/intentExecutor.js";
import Provenance from "../state/provenance.js";
import SampleView from "../sampleView/sampleView.js";

/**
 * @typedef {import("@genome-spy/core/types/viewContext.js").default} ViewContext
 * @typedef {import("@genome-spy/core/spec/sampleView.js").SampleSpec} SampleSpec
 * @typedef {ReturnType<setupStore>} AppStore
 */

/**
 * @param {{ context?: ViewContext }} [options]
 */
export function createAppTestContext(options = {}) {
    const context = options.context ?? createTestViewContext();
    const store = setupStore();
    const intentExecutor = new IntentExecutor(store);
    const provenance = new Provenance(store, intentExecutor);

    context.animator = {
        transition: () => Promise.resolve(),
        requestRender: () => undefined,
    };
    context.requestLayoutReflow = () => undefined;
    context.updateTooltip = () => undefined;
    context.getCurrentHover = () => undefined;
    context.addKeyboardListener = () => undefined;
    context.addBroadcastListener = () => undefined;
    context.removeBroadcastListener = () => undefined;
    context.setDataLoadingStatus = () => undefined;
    context.glHelper = undefined;

    return {
        context,
        store,
        provenance,
        intentExecutor,
    };
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
