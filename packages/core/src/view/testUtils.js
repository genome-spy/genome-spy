/**
 * Utils for Jest tests
 * TODO: Find a better place and convention
 *
 * @typedef {import("../spec/view").ViewSpec} ViewSpec
 * @typedef {import("../types/viewContext").default} ViewContext
 */

import { resolveScalesAndAxes, initializeData } from "./viewUtils.js";
import AccessorFactory from "../encoder/accessor.js";
import DataFlow from "../data/dataFlow.js";
import { ViewFactory } from "./viewFactory.js";
import GenomeStore from "../genome/genomeStore.js";
import ImplicitRootView from "./implicitRootView.js";
import View from "./view.js";
import BmFontManager from "../fonts/bmFontManager.js";

/**
 *
 * @param {Partial<ViewContext>} partialContext
 * @returns
 */
export function createTestViewContext(partialContext = {}) {
    const viewTypeRegistry = new ViewFactory();

    const genomeStore = new GenomeStore(".");
    genomeStore.initialize({
        name: "test",
        contigs: [
            { name: "chr1", size: 20 },
            { name: "chr2", size: 30 },
        ],
    });

    const c = /** @type {ViewContext} */ ({
        accessorFactory: new AccessorFactory(),

        createView: function (spec, parent, defaultName) {
            return viewTypeRegistry.createView(spec, c, parent, defaultName);
        },

        dataFlow: new DataFlow(),
        genomeStore,

        fontManager: new BmFontManager(),

        isViewConfiguredVisible: () => true,

        ...partialContext,
    });

    return c;
}

/** @type {<V extends View>(spec: ViewSpec, viewClass: { new(...args: any[]): V }, context?: ViewContext) => V} */
export function create(spec, viewClass, context = undefined) {
    const c = createTestViewContext(context);
    const view = c.createView(spec, null, null, "root");

    if (!(view instanceof viewClass)) {
        throw new Error("ViewClass and the spec do not match!");
    }

    return view;
}

/**
 * Creates a view and initializes its data. Does not wrap it in an implicit root view.
 *
 * @type {<V extends View>(spec: ViewSpec, viewClass: { new(...args: any[]): V }, context?: ViewContext, options?: {noData: boolean, implicitRoot: boolean}) => Promise<V>}
 */
export async function createAndInitialize(
    spec,
    viewClass,
    context = undefined,
    options = { noData: false, implicitRoot: false }
) {
    const view = create(spec, viewClass, context);

    resolveScalesAndAxes(view);
    await initializeData(view, view.context.dataFlow);
    return view;
}

/**
 * Creates a view and wraps it in an implicit root view if needed.
 * Does not initialize data.
 *
 * @param {ViewSpec} spec
 */
export async function createAndWrap(spec) {
    const view = create(spec, View);

    const root =
        view.needsAxes.x || view.needsAxes.y
            ? new ImplicitRootView(view.context, view)
            : view;

    resolveScalesAndAxes(root);
    return root;
}
