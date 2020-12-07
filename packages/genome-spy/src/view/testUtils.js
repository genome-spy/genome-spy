/**
 * Utils for Jest tests
 * TODO: Find a better place and convention
 */

import { createView, resolveScalesAndAxes, initializeData } from "./viewUtils";
import AccessorFactory from "../encoder/accessor";

/**
 *
 * @param {import("./viewUtils").ViewSpec} spec
 * @param {import("./viewUtils").ViewContext} [context]
 */
export function create(spec, context) {
    const c = {
        ...(context || {}),
        accessorFactory: new AccessorFactory()
    };

    return createView(spec, c);
}

/**
 *
 * @param {import("./viewUtils").ViewSpec} spec
 * @param {import("./viewUtils").ViewContext} [context]
 */
export async function createAndInitialize(spec, context) {
    const view = create(spec, context);
    resolveScalesAndAxes(view);
    await initializeData(view);
    return view;
}
