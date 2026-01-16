import { isObject, isString } from "vega-util";

import UnitView from "./unitView.js";
// eslint-disable-next-line no-unused-vars
import View, { VISIT_SKIP, VISIT_STOP } from "./view.js";
import { isFieldDef, primaryPositionalChannels } from "../encoder/encoder.js";
import { rollup } from "d3-array";
import { concatUrl, getDirectory } from "../utils/url.js";

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
 * Initializes scale instances after resolution has stabilized.
 *
 * @param {View} root
 */
export function initializeScaleResolutions(root) {
    root.visit((view) => {
        for (const resolution of Object.values(view.resolutions.scale)) {
            resolution.initializeScale();
        }
    });
}

/**
 * @param {Promise<import("../marks/mark.js").default>[]} graphicsPromises
 * @param {() => boolean} [shouldFinalize]
 * @returns {Promise<void>}
 */
export function finalizeSubtreeGraphics(
    graphicsPromises,
    shouldFinalize = () => true
) {
    return Promise.allSettled(graphicsPromises).then((results) => {
        if (!shouldFinalize()) {
            return;
        }

        for (const result of results) {
            if ("value" in result) {
                result.value.finalizeGraphicsInitialization();
            } else if ("reason" in result) {
                console.error(result.reason);
            }
        }
    });
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
 * @returns {Promise<import("../spec/view.js").ViewSpec>}
 */
export async function loadExternalViewSpec(spec, baseUrl, viewContext) {
    const importParam = spec.import;
    if (!("url" in importParam)) {
        throw new Error("Not an url import: " + JSON.stringify(importParam));
    }

    const url = concatUrl(baseUrl, importParam.url);

    /** @type {import("../spec/view.js").ViewSpec} */
    let importedSpec;

    try {
        const result = await fetch(url);
        if (!result.ok) {
            throw new Error(`${result.status} ${result.statusText}`);
        }
        importedSpec = await result.json();
    } catch (e) {
        throw new Error(
            `Could not load imported view spec: ${url}. Reason: ${e.message}`
        );
    }

    if (viewContext.isViewSpec(importedSpec)) {
        importedSpec.baseUrl = concatUrl(
            getDirectory(importParam.url),
            importedSpec.baseUrl
        );
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
 * @param {import("./view.js").default} viewRoot
 */
export function calculateCanvasSize(viewRoot) {
    const size = viewRoot.getSize();
    const padding = viewRoot.getPadding();

    // If a dimension has an absolutely specified size (in pixels), use it for the canvas size.
    // However, if the dimension has a growing component, the canvas should be fit to the
    // container.
    // TODO: Enforce the minimum size (in case of both absolute and growing components).

    /**
     * @param {import("./layout/flexLayout.js").SizeDef} dim
     * @param {number} totalPad
     */
    const f = (dim, totalPad) => (dim.grow > 0 ? undefined : dim.px + totalPad);
    return {
        width: f(size.width, padding.horizontalTotal),
        height: f(size.height, padding.verticalTotal),
    };
}
