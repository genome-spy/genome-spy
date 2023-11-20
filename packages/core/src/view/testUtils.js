/**
 * Utils for Jest tests
 * TODO: Find a better place and convention
 *
 * @typedef {import("../spec/view.js").ViewSpec} ViewSpec
 * @typedef {import("../types/viewContext.js").default} ViewContext
 */

import { checkForDuplicateScaleNames, initializeData } from "./viewUtils.js";
import AccessorFactory from "../encoder/accessor.js";
import DataFlow from "../data/dataFlow.js";
import { VIEW_ROOT_NAME, ViewFactory } from "./viewFactory.js";
import GenomeStore from "../genome/genomeStore.js";
import BmFontManager from "../fonts/bmFontManager.js";

/**
 * @param {import("./viewFactory.js").ViewFactoryOptions} [viewFactoryOptions]
 * @returns
 */
export function createTestViewContext(viewFactoryOptions = {}) {
    const viewFactory = new ViewFactory({
        allowImport: false,
        wrapRoot: false,
        ...viewFactoryOptions,
    });

    const genomeStore = new GenomeStore(".");
    genomeStore.initialize({
        name: "test",
        contigs: [
            { name: "chr1", size: 20 },
            { name: "chr2", size: 30 },
        ],
    });

    // @ts-expect-error
    const c = /** @type {ViewContext} */ ({
        accessorFactory: new AccessorFactory(),

        createView: function (spec, parent, defaultName) {
            throw new Error("Not implemented: createView");
        },

        createOrImportView: async function (
            spec,
            parent,
            dataParent,
            defaultName
        ) {
            return viewFactory.createOrImportView(
                spec,
                this,
                parent,
                dataParent,
                defaultName
            );
        },

        dataFlow: new DataFlow(),
        genomeStore,

        fontManager: new BmFontManager(),

        isViewConfiguredVisible: () => true,

        //...partialContext,
    });

    return c;
}

/**
 * @type {<V extends import("./view.js").default>(spec: ViewSpec, viewClass: { new(...args: any[]): V }, ViewFactoryOptions?: import("./viewFactory.js").ViewFactoryOptions) => Promise<V>}
 */
export async function create(spec, viewClass, viewFactoryOptions = {}) {
    const c = createTestViewContext(viewFactoryOptions);
    const view = await c.createOrImportView(spec, null, null, VIEW_ROOT_NAME);

    if (!(view instanceof viewClass)) {
        throw new Error("ViewClass and the spec do not match!");
    }

    return view;
}

/**
 * Creates a view and initializes its data. Does not wrap it in an implicit root view.
 *
 * @type {<V extends import("./view.js").default>(spec: ViewSpec, viewClass: { new(...args: any[]): V }, context?: ViewContext, options?: {noData: boolean, implicitRoot: boolean}) => Promise<V>}
 */
export async function createAndInitialize(spec, viewClass) {
    const view = await create(spec, viewClass);

    checkForDuplicateScaleNames(view);
    await initializeData(view, view.context.dataFlow);
    return view;
}
