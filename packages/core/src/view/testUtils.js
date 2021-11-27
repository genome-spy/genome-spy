/**
 * Utils for Jest tests
 * TODO: Find a better place and convention
 *
 * @typedef {import("./view").default} View
 * @typedef {import("../spec/view").ViewSpec} ViewSpec
 * @typedef {import("./viewContext").default} ViewContext
 */

import { resolveScalesAndAxes, initializeData } from "./viewUtils";
import AccessorFactory from "../encoder/accessor";
import DataFlow from "../data/dataFlow";
import { ViewFactory } from "./viewFactory";

/** @type {<V extends View>(spec: ViewSpec, viewClass: { new(...args: any[]): V }, context?: ViewContext) => V} */
export function create(spec, viewClass, context = undefined) {
    const viewTypeRegistry = new ViewFactory();

    const c = /** @type {ViewContext} */ ({
        ...(context || {}),
        accessorFactory: new AccessorFactory(),

        createView: function (spec, parent, defaultName) {
            return viewTypeRegistry.createView(spec, c, parent, defaultName);
        },
    });

    const view = c.createView(spec, null, "root");

    if (!(view instanceof viewClass)) {
        throw new Error("ViewClass and the spec do not match!");
    }

    return view;
}

/** @type {<V extends View>(spec: ViewSpec, viewClass: { new(...args: any[]): V }, context?: ViewContext) => Promise<V>} */
export async function createAndInitialize(
    spec,
    viewClass,
    context = undefined
) {
    context = /** @type {ViewContext} */ ({
        ...(context || {}),
        dataFlow: new DataFlow(),
    });
    const view = create(spec, viewClass, context);
    resolveScalesAndAxes(view);
    await initializeData(view, context.dataFlow);
    return view;
}
