/**
 * Utils for Jest tests
 * TODO: Find a better place and convention
 *
 * @typedef {import("../spec/root.js").RootSpec} RootSpec
 * @typedef {import("../types/viewContext.js").default} ViewContext
 */

import { checkForDuplicateScaleNames } from "./viewUtils.js";
import {
    initializeViewSubtree,
    loadViewSubtreeData,
} from "../data/flowInit.js";
import { VIEW_ROOT_NAME } from "./viewFactory.js";
import UnitView from "./unitView.js";
import ContainerView from "./containerView.js";
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

export { createHeadlessEngine };
