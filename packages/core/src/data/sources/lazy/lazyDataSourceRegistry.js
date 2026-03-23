/**
 * @template {import("../../../spec/data.js").LazyDataParams} P
 * @typedef {{
 *   guard: (params: import("../../../spec/data.js").LazyDataParams) => params is P,
 *   Source: new (params: any, view: import("../../../view/view.js").default) => import("../dataSource.js").default
 * }} LazySourceEntry
 */

/** @type {LazySourceEntry<any>[]} */
const customLazySources = [];

/** @type {LazySourceEntry<any>[]} */
const builtinLazySources = [];

/**
 * Registers a lazy data source for a custom type.
 *
 * @template {import("../../../spec/data.js").LazyDataParams} P
 * @param {LazySourceEntry<P>["guard"]} guard
 * @param {LazySourceEntry<P>["Source"]} Source
 * @returns {() => void}
 */
export function registerLazyDataSource(guard, Source) {
    /** @type {LazySourceEntry<any>} */
    const entry = { guard, Source };
    customLazySources.push(entry);
    return () => {
        const index = customLazySources.indexOf(entry);
        if (index >= 0) {
            customLazySources.splice(index, 1);
        }
    };
}

/**
 * Registers a built-in lazy data source.
 *
 * @template {import("../../../spec/data.js").LazyDataParams} P
 * @param {LazySourceEntry<P>["guard"]} guard
 * @param {LazySourceEntry<P>["Source"]} Source
 */
export function registerBuiltInLazyDataSource(guard, Source) {
    builtinLazySources.push({ guard, Source });
}

/**
 * @param {import("../../../spec/data.js").LazyDataParams} params
 * @param {import("../../../view/view.js").default} view
 */
export function createLazyDataSource(params, view) {
    for (const entry of customLazySources) {
        if (entry.guard(params)) {
            return new entry.Source(/** @type {any} */ (params), view);
        }
    }
    for (const entry of builtinLazySources) {
        if (entry.guard(params)) {
            return new entry.Source(/** @type {any} */ (params), view);
        }
    }

    throw new Error(
        "Cannot figure out the data source type: " + JSON.stringify(params)
    );
}
