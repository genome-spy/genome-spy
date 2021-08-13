/**
 * Utils for Jest tests
 * TODO: Find a better place and convention
 *
 * @typedef {import("./view").default} View
 * @typedef {import("../spec/view").ViewSpec} ViewSpec
 * @typedef {import("./viewContext").default} ViewContext
 */

import { createView, resolveScalesAndAxes, initializeData } from "./viewUtils";
import AccessorFactory from "../encoder/accessor";
import DataFlow from "../data/dataFlow";

/** @type {<V extends View>(spec: ViewSpec, viewClass: { new(...args: any[]): V }, context?: ViewContext) => V} */
export function create(spec, viewClass, context = undefined) {
    const c = {
        ...(context || {}),
        accessorFactory: new AccessorFactory()
    };

    const view = createView(spec, c);

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
    context = { ...(context || {}), dataFlow: new DataFlow() };
    const view = create(spec, viewClass, context);
    resolveScalesAndAxes(view);
    await initializeData(view, context.dataFlow);
    return view;
}
