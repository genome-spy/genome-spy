/**
 * Utils for Jest tests
 * TODO: Find a better place and convention
 */

import { createView, initializeViewHierarchy } from "./viewUtils";
import DataSource from '../data/dataSource';
import AccessorFactory from "../encoder/accessor";

/**
 * 
 * @param {import("./viewUtils").Spec} spec 
 * @param {import("./viewUtils").ViewContex} [context]
 */
export function create(spec, context) {
    const c = {
        ...context || {},
        /** @param {object} config */
        getDataSource: config => new DataSource(config, "."),
        accessorFactory: new AccessorFactory()
    };

    return createView(spec, c);
}

/**
 * 
 * @param {import("./viewUtils").Spec} spec 
 * @param {import("./viewUtils").ViewContex} [context]
 */
export async function createAndInitialize(spec, context) {
    const view = create(spec, context);
    await initializeViewHierarchy(view);
    return view;
}
