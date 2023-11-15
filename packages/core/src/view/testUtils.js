/**
 * Utils for Jest tests
 * TODO: Find a better place and convention
 *
 * @typedef {import("../spec/view").ViewSpec} ViewSpec
 * @typedef {import("../types/viewContext").default} ViewContext
 */

import { checkForDuplicateScaleNames, initializeData } from "./viewUtils.js";
import AccessorFactory from "../encoder/accessor.js";
import DataFlow from "../data/dataFlow.js";
import { ViewFactory, isImportSpec } from "./viewFactory.js";
import GenomeStore from "../genome/genomeStore.js";
import BmFontManager from "../fonts/bmFontManager.js";
import ContainerView from "./containerView.js";

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
            throw new Error("Not implemented: createView");
        },

        createOrImportView: async function (spec, parent, defaultName) {
            if (!isImportSpec(spec)) {
                const view = viewTypeRegistry.createView(
                    spec,
                    c,
                    parent,
                    defaultName
                );
                if (view instanceof ContainerView) {
                    await view.initializeChildren();
                }
                return view;
            } else {
                throw new Error("Import specs not supported in tests!");
            }
        },

        dataFlow: new DataFlow(),
        genomeStore,

        fontManager: new BmFontManager(),

        isViewConfiguredVisible: () => true,

        ...partialContext,
    });

    return c;
}

/** @type {<V extends import("./view.js").default>(spec: ViewSpec, viewClass: { new(...args: any[]): V }, context?: ViewContext) => Promise<V>} */
export async function create(spec, viewClass, context = undefined) {
    const c = createTestViewContext(context);
    const view = await c.createOrImportView(spec, null, null, "root");

    if (!(view instanceof viewClass)) {
        throw new Error("ViewClass and the spec do not match!");
    }

    if (view instanceof ContainerView) {
        await view.initializeChildren();
    }

    return view;
}

/**
 * Creates a view and initializes its data. Does not wrap it in an implicit root view.
 *
 * @type {<V extends import("./view.js").default>(spec: ViewSpec, viewClass: { new(...args: any[]): V }, context?: ViewContext, options?: {noData: boolean, implicitRoot: boolean}) => Promise<V>}
 */
export async function createAndInitialize(
    spec,
    viewClass,
    context = undefined,
    options = { noData: false, implicitRoot: false }
) {
    const view = await create(spec, viewClass, context);

    checkForDuplicateScaleNames(view);
    await initializeData(view, view.context.dataFlow);
    return view;
}
