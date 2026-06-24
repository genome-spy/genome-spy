import { createViewMutationApi } from "./viewMutationApi.js";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import { renderToLayout } from "./testUtils.js";

/**
 * @typedef {{
 *   view: import("./view.js").default,
 *   api: import("../types/embedApi.js").ViewApi,
 *   context: import("../types/viewContext.js").default
 * }} ViewMutationAcidHarness
 */

/**
 * @param {import("../spec/root.js").RootSpec} spec
 * @param {Parameters<typeof createHeadlessEngine>[1]} [options]
 * @returns {Promise<ViewMutationAcidHarness>}
 */
export async function createViewMutationAcidHarness(spec, options) {
    const { view, context } = await createHeadlessEngine(spec, options);

    return {
        view,
        api: createViewMutationApi({ viewRoot: view }),
        context,
    };
}

/**
 * Captures normalized lifecycle state that should remain stable after a
 * round-trip mutation.
 *
 * @param {import("./view.js").default} viewRoot
 */
export function createMutationAcidSnapshot(viewRoot) {
    return {
        hierarchy: createHierarchySnapshot(viewRoot),
        layout: renderToLayout(viewRoot),
    };
}

/**
 * Captures object identities that should survive a round-trip mutation.
 *
 * @param {import("./view.js").default} viewRoot
 */
export function captureMutationAcidIdentities(viewRoot) {
    const views = viewRoot.getDescendants();

    return {
        views,
        collectors: views.map((view) => view.flowHandle?.collector),
    };
}

/**
 * @template T
 * @returns {{
 *   promise: Promise<T>,
 *   resolve: (value: T) => void,
 *   reject: (reason?: unknown) => void
 * }}
 */
export function createDeferred() {
    /** @type {(value: any) => void} */
    let resolve;
    /** @type {(reason?: unknown) => void} */
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });

    return { promise, resolve, reject };
}

/**
 * @param {() => boolean} predicate
 * @returns {Promise<void>}
 */
export async function waitUntil(predicate) {
    for (let i = 0; i < 50; i++) {
        if (predicate()) {
            return;
        }

        await new Promise((resolve) => setTimeout(resolve, 0));
    }

    throw new Error("Condition was not met.");
}

/**
 * @param {import("./view.js").default} viewRoot
 * @param {string} name
 */
export function getRequiredView(viewRoot, name) {
    const view = viewRoot.getDescendants().find((view) => view.name === name);
    if (!view) {
        throw new Error("Expected view: " + name);
    }

    return view;
}

/**
 * @param {import("./view.js").default} view
 */
export function countCollectorRows(view) {
    const collector = view.flowHandle?.collector;
    if (!collector) {
        throw new Error("Expected view to have a collector.");
    }

    let count = 0;
    for (const datum of collector.getData()) {
        void datum;
        count++;
    }

    return count;
}

/**
 * @param {import("./view.js").default} viewRoot
 */
function createHierarchySnapshot(viewRoot) {
    const views = viewRoot.getDescendants();
    const viewIndexes = new Map(views.map((view, index) => [view, index]));

    return views.map((view) => ({
        name: view.name,
        explicitName: view.explicitName,
        defaultName: view.defaultName,
        type: view.constructor.name,
        dataState: view.getDataInitializationState(),
        visibleInSpec: view.isVisibleInSpec(),
        configuredVisible: view.isConfiguredVisible(),
        layoutParent: getViewIndex(viewIndexes, view.layoutParent),
        dataParent: getViewIndex(viewIndexes, view.dataParent),
        children: getLayoutChildren(view).map((child) =>
            getRequiredViewIndex(viewIndexes, child)
        ),
        flowHandle: {
            dataSource: Boolean(view.flowHandle?.dataSource),
            collector: Boolean(view.flowHandle?.collector),
        },
        resolutions: createResolutionSnapshot(view, viewIndexes),
    }));
}

/**
 * @param {Map<import("./view.js").default, number>} viewIndexes
 * @param {import("./view.js").default | null | undefined} view
 */
function getViewIndex(viewIndexes, view) {
    return view ? getRequiredViewIndex(viewIndexes, view) : undefined;
}

/**
 * @param {Map<import("./view.js").default, number>} viewIndexes
 * @param {import("./view.js").default} view
 */
function getRequiredViewIndex(viewIndexes, view) {
    const index = viewIndexes.get(view);
    if (index === undefined) {
        throw new Error("Expected view to be included in the hierarchy.");
    }

    return index;
}

/**
 * @param {import("./view.js").default} view
 * @returns {import("./view.js").default[]}
 */
function getLayoutChildren(view) {
    const children = /** @type {{ children?: unknown }} */ (view).children;
    return Array.isArray(children)
        ? /** @type {import("./view.js").default[]} */ (children)
        : [];
}

/**
 * @param {import("./view.js").default} view
 * @param {Map<import("./view.js").default, number>} viewIndexes
 */
function createResolutionSnapshot(view, viewIndexes) {
    return {
        scale: Object.fromEntries(
            Object.entries(view.resolutions.scale)
                .filter((entry) => entry[1])
                .map(([channel, resolution]) => [
                    channel,
                    resolution.getOrderedMembers().map((member) => ({
                        view: getRequiredViewIndex(viewIndexes, member.view),
                        channel: member.channel,
                        contributesToDomain: member.contributesToDomain,
                    })),
                ])
        ),
        axis: Object.fromEntries(
            Object.entries(view.resolutions.axis)
                .filter((entry) => entry[1])
                .map(([channel, resolution]) => [
                    channel,
                    {
                        visible: resolution.hasVisibleNonChromeMember(),
                        title: resolution.getTitle(),
                    },
                ])
        ),
        legend: Object.fromEntries(
            Object.entries(view.resolutions.legend)
                .filter((entry) => entry[1])
                .map(([channel, resolution]) => [
                    channel,
                    {
                        visible: resolution.hasVisibleNonChromeMember(),
                        definitions: resolution
                            .getLegendDefs()
                            .map((definition) => ({
                                view: getRequiredViewIndex(
                                    viewIndexes,
                                    definition.view
                                ),
                                channel: definition.channel,
                                type: definition.type,
                                field: definition.field,
                            })),
                    },
                ])
        ),
    };
}
