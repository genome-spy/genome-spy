/** Native visibility and hierarchy shared by embedded controls and agent calls. */
import { isVisibilityConfigurable } from "./configurableVisibilityUtils.js";
import {
    getRadioVisibilityGroupsBySelector,
    getUniqueViewSelectorKeys,
    getViewSettingsHierarchy,
    getViewVisibilityKey,
} from "./viewVisibilityUtils.js";
import { getViewSelector } from "./viewSelectors.js";

/**
 * @typedef {Pick<import("../genomeSpyBase.js").default,
 * "viewRoot" | "getViewVisibilityOverrides" | "setViewVisibilityOverrides" | "refreshViewVisibility" | "assertViewVisibilityChangeAllowed" | "invalidateViewVisibility">} VisibilityHost
 */

/**
 * Read the same hierarchy as App and change visibility without removing views.
 * The host supplies storage; App keeps using its existing Redux/bookmark state.
 * @param {VisibilityHost} host
 * @param {(address: import("../types/embedApi.js").ViewAddress) => import("./view.js").default} getView
 * @param {<T>(operation: () => T | Promise<T>) => Promise<T>} enqueue
 * @param {() => boolean} isActive
 * @returns {import("../types/embedApi.js").ViewVisibilityApi}
 */
export function createViewVisibilityApi(host, getView, enqueue, isActive) {
    /** Reject reads and queued writes after the embed has been finalized. */
    function ensureActive() {
        if (!isActive())
            throw new Error("Cannot use visibility through a finalized embed.");
    }

    return {
        /** Return named menu entries with detached choices and nested children. */
        getSnapshot() {
            ensureActive();
            const root = host.viewRoot;
            const unique = getUniqueViewSelectorKeys(root);
            const groups = getRadioVisibilityGroupsBySelector(root);
            const hierarchy = getViewSettingsHierarchy(root, (view) =>
                Boolean(view.explicitName)
            );
            if (!hierarchy) return [];

            /**
             * Copy only menu metadata; snapshots contain no live views or data.
             * @param {import("../utils/nestPaths.js").NestedItem<import("./view.js").default>} node
             * @returns {import("../types/embedApi.js").ViewVisibilityNode}
             */
            function describe(node) {
                const view = node.item;
                const key = getViewVisibilityKey(view);
                const group = groups.get(key)?.groupKey;
                return {
                    selector: getViewSelector(view),
                    title: view.getTitleText() ?? view.explicitName,
                    visible: view.isConfiguredVisible(),
                    effectiveVisible: view.isVisible(),
                    defaultVisible: view.isVisibleInSpec(),
                    configurable:
                        unique.has(key) && isVisibilityConfigurable(view),
                    ...(group ? { group } : {}),
                    children: node.children.map(describe),
                };
            }

            // Omit anonymous wrappers, but keep every named choice restorable.
            const nodes = hierarchy.item.explicitName
                ? [hierarchy]
                : hierarchy.children;
            return nodes.map(describe);
        },

        /** Apply one choice, including its scoped radio siblings, and await layout. */
        set(address, visible) {
            return enqueue(async () => {
                ensureActive();
                host.assertViewVisibilityChangeAllowed();
                if (typeof visible !== "boolean")
                    throw new Error("Visibility must be a boolean.");
                const view = getView(address);
                const key = getViewVisibilityKey(view);
                if (
                    !key ||
                    !getUniqueViewSelectorKeys(host.viewRoot).has(key)
                ) {
                    throw new Error(
                        "Visibility requires a uniquely named view."
                    );
                }

                const overrides = { ...host.getViewVisibilityOverrides() };
                // A radio choice changes siblings in its own import scope only.
                const group = getRadioVisibilityGroupsBySelector(
                    host.viewRoot
                ).get(key);
                if (visible && group) {
                    for (const member of group.memberKeys)
                        overrides[member] = false;
                }
                overrides[key] = visible;
                host.setViewVisibilityOverrides(overrides);
                await host.refreshViewVisibility();
                ensureActive();
            });
        },

        /** Restore authored defaults without releasing views or their selections. */
        reset() {
            return enqueue(async () => {
                ensureActive();
                host.assertViewVisibilityChangeAllowed();
                host.setViewVisibilityOverrides({});
                await host.refreshViewVisibility();
                ensureActive();
            });
        },
    };
}
