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
 */
export function create(spec) {
    const context = {
        /** @param {object} config */
        getDataSource: config => new DataSource(config, "."),
        accessorFactory: new AccessorFactory()
    };

    return createView(spec, context);
}

/**
 * 
 * @param {import("./viewUtils").Spec} spec 
 */
export async function createAndInitialize(spec) {
    const view = create(spec);
    await initializeViewHierarchy(view);
    return view;
}
