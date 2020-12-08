import { isObject, isString, isArray } from "vega-util";
import { loader as vegaLoader } from "vega-loader";

import UnitView from "./unitView";
import ImportView from "./importView";
import LayerView from "./layerView";
import FacetView from "./facetView";
import SampleView from "./sampleView/sampleView";
import ConcatView from "./concatView";
import DecoratorView from "./decoratorView";
import { VISIT_SKIP } from "./view";
import { buildDataFlow } from "./flowBuilder";

/**
 * @typedef {Object} ViewContext
 * @prop {import("../genomeSpy").default} genomeSpy TODO: Break genomeSpy dependency
 * @prop {import("../encoder/accessor").default} accessorFactory
 * @prop {import("../coordinateSystem").default} coordinateSystem
 * @prop {import("../gl/webGLHelper").default} glHelper
 * @prop {import("../utils/animator").default} animator
 */

/**
 * @typedef {import("../spec/view").MarkConfig} MarkConfig
 * @typedef {import("../spec/view").EncodingConfig} EncodingConfig
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
 * @typedef {import("../spec/view").RootSpec} RootSpec
 * @typedef {import("../spec/view").RootConfig} RootConfig
 * @typedef {import("./view").default} View
 *
 * @typedef {import("../spec/view").FacetFieldDef} FacetFieldDef
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
 * @param {FacetFieldDef | FacetMapping} spec
 * @returns {spec is FacetFieldDef}
 */
export function isFacetFieldDef(spec) {
    return "field" in spec && isString(spec.field);
}

/**
 *
 * @param {FacetFieldDef | FacetMapping} spec
 * @returns {spec is FacetMapping}
 */
export function isFacetMapping(spec) {
    return (
        ("row" in spec && isObject(spec.row)) ||
        ("column" in spec && isObject(spec.column))
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
        isConcatSpec
    ];

    const matches = guards.filter(guard => guard(spec));

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
            "Invalid spec, cannot figure out the view: " + JSON.stringify(spec)
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

    return /** @type {View} */ (new ViewClass(
        spec,
        context,
        null,
        spec.name || "root"
    ));
}

/**
 * Returns all marks in the order (DFS) they are rendered
 * @param {View} root
 */
export function getMarks(root) {
    return getFlattenedViews(root)
        .filter(view => view instanceof UnitView)
        .map(view => /** @type {UnitView} */ (view).mark);
}

/**
 * Returns the nodes of the view hierarchy in depth-first order.
 *
 * @param {View} root
 */
export function getFlattenedViews(root) {
    /** @type {View[]} */
    const views = [];
    root.visit(view => {
        views.push(view);
    });
    return views;
}

/**
 * @param {View} root
 */
export function resolveScalesAndAxes(root) {
    root.visit(view => {
        if (view instanceof UnitView) {
            view.resolve("scale");
        }
    });
    root.visit(view => {
        if (view instanceof UnitView) {
            view.resolve("axis");
        }
    });
}

/**
 * @param {View} root
 */
export function addDecorators(root) {
    let newRoot = root; // If the root is wrapped...

    /** @param {EncodingConfig} encodingConfig */
    const hasDomain = encodingConfig =>
        encodingConfig && !("value" in encodingConfig);

    root.visit(view => {
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

            if (originalParent) {
                originalParent.replaceChild(view, decorator);
            }

            decorator.resolutions = view.resolutions;
            decorator.name = view.name;
            decorator.spec.height = view.spec.height;
            decorator.spec.width = view.spec.width;
            decorator.spec.padding = view.spec.padding;

            view.resolutions = { scale: {}, axis: {} };
            view.name = "decorated_" + view.name;
            view.spec.height = "container";
            view.spec.width = "container";
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
 */
export async function initializeData(root) {
    /** @type {Promise<void>[]} */
    const promises = buildDataFlow(root).map(dataSource => dataSource.load());

    await Promise.all(promises);

    root.visit(view => {
        if (view instanceof UnitView) {
            view.mark.initializeData();
        }
    });
}

/**
 *
 * @param {View} view
 */
export function findEncodedFields(view) {
    /** @type {{view: View, channel: string, field: string, type: string}[]} */
    const fieldInfos = [];

    view.visit(view => {
        if (view instanceof UnitView) {
            const encoding = view.getEncoding();
            for (const [channel, def] of Object.entries(encoding)) {
                const field = def.field;
                if (field) {
                    fieldInfos.push({ view, channel, field, type: def.type });
                }
            }
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
        await loader.load(url).catch(e => {
            throw new Error(
                `Could not load imported view spec: ${url} \nReason: ${e.message}`
            );
        })
    );

    if (isViewSpec(importedSpec)) {
        importedSpec.baseUrl = (await loader.sanitize(url)).href.match(
            /^.*\//
        )[0];
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

    viewRoot.visit(view => {
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
