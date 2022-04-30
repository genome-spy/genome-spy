import { isObject, isString } from "vega-util";
import { loader as vegaLoader } from "vega-loader";

import UnitView from "./unitView";
import ImportView from "./importView";
// eslint-disable-next-line no-unused-vars
import View, { VISIT_SKIP, VISIT_STOP } from "./view";
import { buildDataFlow } from "./flowBuilder";
import { optimizeDataFlow } from "../data/flowOptimizer";
import { isFieldDef, primaryPositionalChannels } from "../encoder/encoder";
import { rollup } from "d3-array";

/**
 * @typedef {import("./viewContext").default} ViewContext
 * @typedef {import("../spec/mark").MarkConfig} MarkConfig
 * @typedef {import("../spec/channel").ChannelDef} ChannelDef
 * @typedef {import("../spec/view").ContainerSpec} ContainerSpec
 * @typedef {import("../spec/view").ViewSpec} ViewSpec
 * @typedef {import("../spec/view").LayerSpec} LayerSpec
 * @typedef {import("../spec/view").FacetSpec} FacetSpec
 * @typedef {import("../spec/view").SampleSpec} SampleSpec
 * @typedef {import("../spec/view").UnitSpec} UnitSpec
 * @typedef {import("../spec/view").VConcatSpec} VConcatSpec
 * @typedef {import("../spec/view").HConcatSpec} HConcatSpec
 * @typedef {import("../spec/view").ConcatSpec} ConcatSpec
 * @typedef {VConcatSpec | HConcatSpec | ConcatSpec} AnyConcatSpec
 * @typedef {import("../spec/view").ImportSpec} ImportSpec
 * @typedef {import("../spec/view").ImportConfig} ImportConfig
 * @typedef {import("../spec/root").RootSpec} RootSpec
 *
 * @typedef {import("../spec/view").FacetMapping} FacetMapping
 * @typedef {import("../spec/channel").FacetFieldDef} FacetFieldDef
 */

/**
 *
 * @param {ChannelDef | FacetMapping} def
 * @returns {spec is FacetFieldDef}
 */
export function isFacetFieldDef(def) {
    return def && "field" in def && isString(def.field);
}

/**
 *
 * @param {FacetFieldDef | FacetMapping} def
 * @returns {spec is FacetMapping}
 */
export function isFacetMapping(def) {
    return (
        ("row" in def && isObject(def.row)) ||
        ("column" in def && isObject(def.column))
    );
}

/**
 *
 * @param {object} config
 * @returns {config is ImportConfig}
 */
export function isImportConfig(config) {
    return "name" in config || "url" in config;
}

/**
 * Returns all marks in the order (DFS) they are rendered
 * @param {View} root
 */
export function getMarks(root) {
    return getFlattenedViews(root)
        .filter((view) => view instanceof UnitView)
        .map((view) => /** @type {UnitView} */ (view).mark);
}

/**
 * Returns the nodes of the view hierarchy in depth-first order.
 *
 * @param {View} root
 */
export function getFlattenedViews(root) {
    /** @type {View[]} */
    const views = [];
    root.visit((view) => {
        views.push(view);
    });
    return views;
}

/**
 * @param {View} root
 */
export function resolveScalesAndAxes(root) {
    root.visit((view) => {
        if (view instanceof UnitView) {
            view.resolve("scale");
        }
    });

    // Check that each scale resolution has a unique name
    /** @type {Set<string>} */
    const scaleNames = new Set();
    root.visit((view) => {
        for (const resolution of Object.values(view.resolutions.scale)) {
            const name = resolution.name;
            if (name && scaleNames.has(name)) {
                throw new Error(
                    `The same scale name "${name}" occurs in multiple scale resolutions!`
                );
            }
            scaleNames.add(name);
        }
    });

    root.visit((view) => {
        if (view instanceof UnitView) {
            view.resolve("axis");
        }
    });
    root.visit((view) => view.onScalesResolved());
}

/**
 * Gives names to zoomable scales that have been pulled to the root. This allows
 * the zoomed domains to be bookmarked without explicitly specifying the names.
 * This only affects the trivial but common cases, e.g., a genome-browser-like
 * view with a shared x scale.
 *
 * @param {View} root
 */
export function setImplicitScaleNames(root) {
    for (const channel of primaryPositionalChannels) {
        const resolution = root.getScaleResolution(channel);
        if (resolution && !resolution.name && resolution.isZoomable()) {
            // TODO: Should actually check that the name is not already reserved
            resolution.name = `${channel}_at_root`;
        }
    }
}

/**
 * @param {View} root
 * @param {import("../data/dataFlow").default<View>} [existingFlow] Add data flow
 *      graphs to an existing DataFlow object.
 */
export async function initializeData(root, existingFlow) {
    const flow = buildDataFlow(root, existingFlow);
    optimizeDataFlow(flow);
    flow.initialize();

    /** @type {Promise<void>[]} */
    const promises = flow.dataSources.map((dataSource) => dataSource.load());

    await Promise.all(promises);

    return flow;
}

/**
 *
 * @param {View} view
 */
export function findEncodedFields(view) {
    /** @type {{view: UnitView, channel: import("../spec/channel").Channel, field: import("../spec/channel").Field, type: import("../spec/channel").Type}[]} */
    const fieldInfos = [];

    view.visit((view) => {
        if (view instanceof UnitView) {
            const encoding = view.getEncoding();
            for (const [channel, def] of Object.entries(encoding)) {
                if (isFieldDef(def) && "type" in def) {
                    fieldInfos.push({
                        view,
                        channel,
                        field: def.field,
                        type: def.type,
                    });
                }
            }
            return VISIT_SKIP; // Skip sample summaries
        }
    });

    return fieldInfos;
}

/**
 * @param {import("../spec/view").ImportSpec} spec
 * @param {string} baseUrl
 * @param {ViewContext} viewContext
 */
async function loadExternalViewSpec(spec, baseUrl, viewContext) {
    if (!spec.import.url) {
        throw new Error(
            "Cannot import, not an import spec: " + JSON.stringify(spec)
        );
    }

    const loader = vegaLoader({ baseURL: baseUrl });
    const url = spec.import.url;

    const importedSpec = JSON.parse(
        await loader.load(url).catch((/** @type {Error} */ e) => {
            throw new Error(
                `Could not load imported view spec: ${url} \nReason: ${e.message}`
            );
        })
    );

    if (viewContext.isViewSpec(importedSpec)) {
        importedSpec.baseUrl = url.match(/^[^?#]*\//)?.[0];
        return importedSpec;
    } else {
        throw new Error(
            `The imported spec "${url}" is not a view spec: ${JSON.stringify(
                spec
            )}`
        );
    }
}

/**
 * @param {import("./view").default} viewRoot
 */
export async function processImports(viewRoot) {
    /** @type {ImportView[]} */
    const importViews = [];

    viewRoot.visit((view) => {
        if (view instanceof ImportView) {
            importViews.push(view);
            return VISIT_SKIP;
        }
    });

    for (const view of importViews) {
        const context = view.context;

        // TODO: Parallelize using promises, don't use await
        const loadedSpec = await loadExternalViewSpec(
            view.spec,
            view.getBaseUrl(),
            context
        );

        // TODO: Let importSpec have a name
        const importedView = context.createView(
            loadedSpec,
            view.parent,
            view.name
        );
        view.parent.replaceChild(view, importedView);

        // Import recursively
        await processImports(importedView);
    }
}

/**
 * @param {function(View, View[]):void} visitor
 */
export function stackifyVisitor(visitor) {
    /** @type {View[]} */
    const stack = [];

    /** @type {import("./view").Visitor} */
    const stackified = (view) => visitor(view, stack);

    stackified.beforeChildren = (view) => {
        stack.push(view);
    };

    stackified.afterChildren = (view) => {
        stack.pop();
    };

    return stackified;
}

/**
 * Finds the descendants having the given name. The root is included in the search.
 *
 * @param {View} root
 * @param {string} name View name
 * @returns {View[]}
 */
export function findDescendantsByPath(root, name) {
    /** @type {View[]} */
    const descendants = [];

    root.visit((view) => {
        if (view.name == name) {
            descendants.push(view);
        }
    });

    return descendants;
}

/**
 *
 * @param {View} root
 */
export function findUniqueViewNames(root) {
    /** @type {View[]} */
    const descendants = [];

    root.visit((view) => {
        descendants.push(view);
    });

    return new Set(
        [
            ...rollup(
                descendants,
                (views) => views.length,
                (view) => view.name
            ),
        ]
            .filter(([name, count]) => count == 1 && name !== undefined)
            .map(([name, count]) => name)
    );
}

/**
 * @param {string} name
 */
export const isCustomViewName = (name) => !/^(layer|concat)\d+$/.test(name);
