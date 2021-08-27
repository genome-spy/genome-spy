import { isObject, isString, isArray } from "vega-util";
import { loader as vegaLoader } from "vega-loader";

import UnitView from "./unitView";
import ImportView from "./importView";
import LayerView from "./layerView";
import FacetView from "./facetView";
import SampleView from "./sampleView/sampleView";
import ConcatView from "./concatView";
import DecoratorView from "./decoratorView";
// eslint-disable-next-line no-unused-vars
import View, { VISIT_SKIP, VISIT_STOP } from "./view";
import { buildDataFlow } from "./flowBuilder";
import { optimizeDataFlow } from "../data/flowOptimizer";
import { isFieldDef, isValueDef } from "../encoder/encoder";
import ContainerView from "./containerView";
import { peek } from "../utils/arrayUtils";

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
 * @typedef {import("../spec/root").RootConfig} RootConfig
 *
 * @typedef {import("../spec/channel").FacetFieldDef} FacetFieldDef
 * @typedef {import("../spec/view").FacetMapping} FacetMapping
 */

/*
// This breaks with Jest or Babel. Some classes mysteriously transform into undefined!
const viewTypes = [
    { prop: "import", guard: isImportSpec, viewClass: ImportView },
    { prop: "layer", guard: isLayerSpec, viewClass: LayerView },
    { prop: "facet", guard: isFacetSpec, viewClass: FacetView },
    { prop: "sample", guard: isSampleSpec, viewClass: SampleView },
    { prop: "mark", guard: isUnitSpec, viewClass: UnitView },
    { prop: "vconcat", guard: isVConcatSpec, viewClass: ConcatView },
    { prop: "hconcat", guard: isHConcatSpec, viewClass: ConcatView },
    { prop: "concat", guard: isConcatSpec, viewClass: ConcatView }
];
*/

/**
 *
 * @param {ViewSpec} spec
 * @returns {spec is UnitSpec}
 */
export function isUnitSpec(spec) {
    return "mark" in spec && (isString(spec.mark) || isObject(spec.mark));
}

/**
 *
 * @param {ViewSpec} spec
 * @returns {spec is LayerSpec}
 */
export function isLayerSpec(spec) {
    return "layer" in spec && isObject(spec.layer);
}

/**
 *
 * @param {ViewSpec} spec
 * @returns {spec is LayerSpec}
 */
export function isFacetSpec(spec) {
    return (
        "facet" in spec &&
        isObject(spec.facet) &&
        "spec" in spec &&
        isObject(spec.spec)
    );
}

/**
 *
 * @param {ViewSpec} spec
 * @returns {spec is SampleSpec}
 */
export function isSampleSpec(spec) {
    return (
        "samples" in spec &&
        isObject(spec.samples) &&
        "spec" in spec &&
        isObject(spec.spec)
    );
}

/**
 *
 * @param {ViewSpec} spec
 * @returns {spec is import("../spec/view").SummarizeSamplesSpec}
 */
export function isAggregateSamplesSpec(spec) {
    return (
        spec &&
        (isUnitSpec(spec) || isLayerSpec(spec)) &&
        "aggregateSamples" in spec
    );
}

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
 * @param {ViewSpec} spec
 * @returns {spec is ViewSpec}
 */
export function isViewSpec(spec) {
    const guards = [
        isImportSpec,
        isLayerSpec,
        isFacetSpec,
        isSampleSpec,
        isUnitSpec,
        isVConcatSpec,
        isHConcatSpec,
        isConcatSpec,
    ];

    const matches = guards.filter((guard) => guard(spec));

    if (matches.length > 1) {
        throw new Error("Ambiguous spec. Cannot create a view!");
    }

    return matches.length == 1;
}

/**
 *
 * @param {ViewSpec} spec
 * @returns {spec is VConcatSpec}
 */
export function isVConcatSpec(spec) {
    return "vconcat" in spec && isArray(spec.vconcat);
}

/**
 *
 * @param {ViewSpec} spec
 * @returns {spec is HConcatSpec}
 */
export function isHConcatSpec(spec) {
    return "hconcat" in spec && isArray(spec.hconcat);
}

/**
 *
 * @param {ViewSpec} spec
 * @returns {spec is ConcatSpec}
 */
export function isConcatSpec(spec) {
    return "concat" in spec && isArray(spec.concat);
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
 *
 * @param {object} spec
 * @returns {spec is ImportSpec}
 */
export function isImportSpec(spec) {
    return "import" in spec;
}

/**
 *
 * @param {ViewSpec | ImportSpec} spec
 * @returns {typeof View}
 */
export function getViewClass(spec) {
    /** @type {typeof View} */
    let ViewClass;

    if (isImportSpec(spec)) {
        ViewClass = ImportView;
    } else if (isLayerSpec(spec)) {
        ViewClass = LayerView;
    } else if (isFacetSpec(spec)) {
        ViewClass = FacetView;
    } else if (isSampleSpec(spec)) {
        ViewClass = SampleView;
    } else if (isUnitSpec(spec)) {
        ViewClass = UnitView;
    } else if (isVConcatSpec(spec)) {
        ViewClass = ConcatView;
    } else if (isHConcatSpec(spec)) {
        ViewClass = ConcatView;
    } else if (isConcatSpec(spec)) {
        ViewClass = ConcatView;
    }

    if (!ViewClass) {
        throw new Error(
            "Invalid spec, cannot figure out the view type from the properties: " +
                JSON.stringify([...Object.keys(spec)])
        );
    }

    return ViewClass;
}

/**
 *
 * @param {ViewSpec} spec
 * @param {ViewContext} context
 */
export function createView(spec, context) {
    const ViewClass = getViewClass(spec);

    return /** @type {View} */ (
        new ViewClass(spec, context, null, spec.name || "root")
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
export function resolveScalesAndAxes(root) {
    root.visit((view) => {
        if (view instanceof UnitView) {
            view.resolve("scale");
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
 * @param {View} root
 */
export function addDecorators(root) {
    let newRoot = root; // If the root is wrapped...

    /** @param {ChannelDef} channelDef */
    const hasDomain = (channelDef) => channelDef && !isValueDef(channelDef);

    root.visit((view) => {
        if (view instanceof LayerView || view instanceof UnitView) {
            const encoding = view.getEncoding();
            if (
                view instanceof UnitView &&
                !hasDomain(encoding.x) &&
                !hasDomain(encoding.y)
            ) {
                // Don't wrap views that have no positional channels
                // TODO: However, in future, views with borders or backgrounds should be wrapped always
                // TODO: Also, views with "axis: null" need no wrapping.
                // TODO: Handle LayerViews, they may have children with positional domains
                return VISIT_SKIP;
            }

            const originalParent = view.parent;
            const decorator = new DecoratorView(view.context, originalParent);
            view.parent = decorator;
            decorator.child = view;
            decorator.name = view.name + "_decorator";

            if (originalParent) {
                if (originalParent instanceof ContainerView) {
                    originalParent.replaceChild(view, decorator);
                } else {
                    // The situation is likely related to summaries of SampleView and the
                    // hierarchy is inconsistent. Let's try to find the SampleView.

                    /** @type {view} */
                    let parent;
                    root.visit(
                        stackifyVisitor((needle, stack) => {
                            if (needle === view) {
                                parent = peek(stack);
                                return VISIT_STOP;
                            }
                        })
                    );

                    if (parent instanceof ContainerView) {
                        parent.replaceChild(view, decorator);
                    } else {
                        throw new Error(
                            "Cannot find parent while decorating: " +
                                view.getPathString()
                        );
                    }
                }
            }

            decorator.resolutions = view.resolutions;
            view.resolutions = { scale: {}, axis: {} };

            decorator.spec.height = view.spec.height;
            view.spec.height = "container";

            decorator.spec.width = view.spec.width;
            view.spec.width = "container";

            decorator.spec.padding = view.spec.padding;
            view.spec.padding = undefined;

            if (view === root) {
                newRoot = decorator;
            }

            decorator.initialize();

            return VISIT_SKIP;
        }
    });

    return newRoot;
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
    /** @type {{view: UnitView, channel: string, field: string, type: string}[]} */
    const fieldInfos = [];

    view.visit((view) => {
        if (view instanceof UnitView) {
            const encoding = view.getEncoding();
            for (const [channel, def] of Object.entries(encoding)) {
                if (isFieldDef(def)) {
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
 */
async function loadExternalViewSpec(spec, baseUrl) {
    if (!spec.import.url) {
        throw new Error(
            "Cannot import, not an import spec: " + JSON.stringify(spec)
        );
    }

    const loader = vegaLoader({ baseURL: baseUrl });
    const url = spec.import.url;

    const importedSpec = JSON.parse(
        await loader.load(url).catch((e) => {
            throw new Error(
                `Could not load imported view spec: ${url} \nReason: ${e.message}`
            );
        })
    );

    if (isViewSpec(importedSpec)) {
        importedSpec.baseUrl = url.match(/^[^?#]*\//)[0];
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
        // TODO: Parallelize using promises, don't use await
        const loadedSpec = await loadExternalViewSpec(
            view.spec,
            view.getBaseUrl()
        );

        const View = getViewClass(loadedSpec);
        const importedView = new View(
            loadedSpec,
            view.context,
            view.parent,
            view.name
        ); // TODO: Let importSpec have a name
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
