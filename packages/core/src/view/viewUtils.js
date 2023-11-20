import { isObject, isString } from "vega-util";
import { loader as vegaLoader } from "vega-loader";

import UnitView from "./unitView.js";
// eslint-disable-next-line no-unused-vars
import View, { VISIT_SKIP, VISIT_STOP } from "./view.js";
import { buildDataFlow } from "./flowBuilder.js";
import { optimizeDataFlow } from "../data/flowOptimizer.js";
import { isFieldDef, primaryPositionalChannels } from "../encoder/encoder.js";
import { rollup } from "d3-array";

/**
 *
 * @param {import("../spec/channel.js").ChannelDef | import("../spec/view.js").FacetMapping} def
 * @returns {spec is FacetFieldDef}
 */
export function isFacetFieldDef(def) {
    return def && "field" in def && isString(def.field);
}

/**
 *
 * @param {import("../spec/channel.js").FacetFieldDef | import("../spec/view.js").FacetMapping} def
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
export function checkForDuplicateScaleNames(root) {
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
 * @param {import("../data/dataFlow.js").default<View>} [existingFlow] Add data flow
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
    /** @type {{view: UnitView, channel: import("../spec/channel.js").Channel, field: import("../spec/channel.js").Field, type: import("../spec/channel.js").Type}[]} */
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
 * @param {import("../spec/view.js").ImportSpec} spec
 * @param {string} baseUrl
 * @param {import("../types/viewContext.js").default} viewContext
 */
export async function loadExternalViewSpec(spec, baseUrl, viewContext) {
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
 * @param {function(View, View[]):void} visitor
 */
export function stackifyVisitor(visitor) {
    /** @type {View[]} */
    const stack = [];

    /** @type {import("./view.js").Visitor} */
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

/**
 * @param {View} viewRoot
 */
export function calculateCanvasSize(viewRoot) {
    const size = viewRoot.getSize().addPadding(viewRoot.getOverhang());

    // If a dimension has an absolutely specified size (in pixels), use it for the canvas size.
    // However, if the dimension has a growing component, the canvas should be fit to the
    // container.
    // TODO: Enforce the minimum size (in case of both absolute and growing components).

    /** @param {import("../utils/layout/flexLayout.js").SizeDef} dim */
    const f = (dim) => (dim.grow > 0 ? undefined : dim.px);
    return {
        width: f(size.width),
        height: f(size.height),
    };
}
