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

/** @typedef {LazySourceEntry<any>["Source"]} SourceConstructor */

/** @type {Map<import("../../../spec/data.js").LazyDataParams["type"], {
 *     load: () => Promise<{ default: SourceConstructor }>,
 *     Source?: SourceConstructor
 * }>} */
const builtinSourceLoaders = new Map();

/**
 * @param {import("../../../spec/data.js").LazyDataParams["type"]} type
 * @param {() => Promise<{ default: SourceConstructor }>} load
 */
export function registerBuiltInLazyDataSourceLoader(type, load) {
    builtinSourceLoaders.set(type, { load });
}

/** @param {import("../../../spec/data.js").LazyDataParams} params */
export function prepareLazyDataSource(params) {
    const entry = builtinSourceLoaders.get(params.type);
    if (
        entry &&
        !entry.Source &&
        !customLazySources.some(({ guard }) => guard(params))
    ) {
        return entry.load().then(({ default: Source }) => {
            entry.Source = Source;
        });
    }
}

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
    const Source = builtinSourceLoaders.get(params.type)?.Source;
    if (Source) return new Source(params, view);

    throw new Error(
        "Cannot figure out the data source type: " + JSON.stringify(params)
    );
}
