/** Shared visibility rules used by the embed API and GenomeSpy App. */
import {
    getImportScopeInfo,
    getViewSelector,
    visitAddressableViews,
} from "./viewSelectors.js";
import {
    getVisibilityGroup,
    isVisibilityConfigurable,
} from "./configurableVisibilityUtils.js";
import { nestPaths } from "../utils/nestPaths.js";

export const VIEW_SELECTOR_KEY_PREFIX = "v:";

/**
 * Keep the native menu's ancestry while omitting unrelated internal views.
 * App can include its parameter/metadata entries through the supplied predicate.
 * @param {import("./view.js").default} root
 * @param {(view: import("./view.js").default) => boolean} include
 * @returns {import("../utils/nestPaths.js").NestedItem<import("./view.js").default> | undefined}
 */
export function getViewSettingsHierarchy(root, include) {
    /** @type {import("./view.js").default[]} */
    const views = [];
    visitAddressableViews(root, (view) => {
        views.push(view);
    });
    const paths = views.filter(include).map((view) =>
        view
            .getLayoutAncestors()
            .filter((ancestor) => ancestor === root || include(ancestor))
            .reverse()
    );
    return paths.length ? nestPaths(paths) : undefined;
}

/**
 * @param {import("./viewSelectors.js").ViewSelector} selector
 * @returns {string}
 */
export function makeViewSelectorKey(selector) {
    return (
        VIEW_SELECTOR_KEY_PREFIX +
        JSON.stringify({ scope: selector.scope, view: selector.view })
    );
}

/**
 * @param {string} key
 * @returns {import("./viewSelectors.js").ViewSelector | undefined}
 */
export function parseViewSelectorKey(key) {
    if (typeof key !== "string" || !key.startsWith(VIEW_SELECTOR_KEY_PREFIX)) {
        return;
    }

    const payload = key.slice(VIEW_SELECTOR_KEY_PREFIX.length);

    let parsed;
    try {
        parsed = JSON.parse(payload);
    } catch {
        return;
    }

    if (
        !parsed ||
        !Array.isArray(parsed.scope) ||
        typeof parsed.view !== "string"
    ) {
        return;
    }

    return {
        scope: parsed.scope,
        view: parsed.view,
    };
}

/**
 * @param {import("./view.js").default} view
 * @returns {string | undefined}
 */
export function getViewVisibilityKey(view) {
    if (!view.explicitName) {
        return;
    }

    return makeViewSelectorKey(getViewSelector(view));
}

/**
 * @param {Record<string, boolean>} visibilities
 * @param {import("./view.js").default} view
 * @returns {boolean | undefined}
 */
export function getViewVisibilityOverride(visibilities, view) {
    const selectorKey = getViewVisibilityKey(view);
    if (selectorKey && hasOwn(visibilities, selectorKey)) {
        return visibilities[selectorKey];
    }

    const explicitName = view.explicitName;
    if (explicitName && hasOwn(visibilities, explicitName)) {
        return visibilities[explicitName];
    }
}

/**
 * @param {import("./view.js").default} viewRoot
 * @returns {Set<string>}
 */
export function getUniqueViewSelectorKeys(viewRoot) {
    /** @type {Map<string, number>} */
    const counts = new Map();

    visitAddressableViews(viewRoot, (view) => {
        const selectorKey = getViewVisibilityKey(view);
        if (!selectorKey) {
            return;
        }

        counts.set(selectorKey, (counts.get(selectorKey) ?? 0) + 1);
    });

    /** @type {Set<string>} */
    const uniqueKeys = new Set();

    for (const [key, count] of counts) {
        if (count === 1) {
            uniqueKeys.add(key);
        }
    }

    return uniqueKeys;
}

/**
 * Returns radio-group membership information by selector key.
 *
 * @param {import("./view.js").default} viewRoot
 * @returns {Map<string, { groupKey: string, memberKeys: string[] }>}
 */
export function getRadioVisibilityGroupsBySelector(viewRoot) {
    /** @type {Map<string, { groupKey: string, memberKeys: string[] }>} */
    const bySelector = new Map();

    for (const [groupKey, members] of collectRadioVisibilityGroups(viewRoot)) {
        const memberKeys = members.map((member) => member.selectorKey);
        for (const member of members) {
            bySelector.set(member.selectorKey, {
                groupKey,
                memberKeys,
            });
        }
    }

    return bySelector;
}

/**
 * Resolves conflicts in mutually exclusive visibility groups so at most one
 * view is visible in each radio group.
 *
 * @param {import("./view.js").default} viewRoot
 * @param {Record<string, boolean>} visibilities
 * @returns {Record<string, boolean>}
 */
export function resolveRadioVisibilityConflicts(viewRoot, visibilities) {
    /** @type {Record<string, boolean>} */
    const resolved = { ...visibilities };

    for (const members of collectRadioVisibilityGroups(viewRoot).values()) {
        const visibleMembers = members.filter((member) => {
            const override = getViewVisibilityOverride(
                visibilities,
                member.view
            );
            if (override !== undefined) {
                return override;
            }

            return member.view.isVisibleInSpec();
        });

        if (visibleMembers.length <= 1) {
            continue;
        }

        const winner = visibleMembers[0].selectorKey;

        for (const member of members) {
            if (member.selectorKey === winner) {
                continue;
            }

            resolved[member.selectorKey] = false;
        }
    }

    return resolved;
}

/**
 * @param {import("./view.js").default} viewRoot
 * @returns {Map<string, { view: import("./view.js").default, selectorKey: string }[]>}
 */
function collectRadioVisibilityGroups(viewRoot) {
    /**
     * @type {Map<string, { view: import("./view.js").default, selectorKey: string }[]>}
     */
    const groups = new Map();

    visitAddressableViews(viewRoot, (view) => {
        if (!isVisibilityConfigurable(view)) {
            return;
        }

        if (!view.explicitName) {
            return;
        }

        const group = getVisibilityGroup(view);
        if (!group) {
            return;
        }

        const selector = getViewSelector(view);
        const selectorKey = makeViewSelectorKey(selector);
        const groupScope =
            getImportScopeInfo(view)?.name && selector.scope.length
                ? selector.scope.slice(0, selector.scope.length - 1)
                : selector.scope;
        const groupKey = JSON.stringify({
            scope: groupScope,
            group,
        });

        const members = groups.get(groupKey);
        if (members) {
            members.push({ view, selectorKey });
        } else {
            groups.set(groupKey, [{ view, selectorKey }]);
        }
    });

    return groups;
}

/**
 * @param {Record<string, boolean>} entries
 * @param {string} key
 * @returns {boolean}
 */
function hasOwn(entries, key) {
    return Object.prototype.hasOwnProperty.call(entries, key);
}
