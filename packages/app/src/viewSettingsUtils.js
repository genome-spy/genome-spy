import {
    getImportScopeInfo,
    getViewSelector,
    visitAddressableViews,
} from "@genome-spy/core/view/viewSelectors.js";
import {
    getVisibilityGroup,
    isVisibilityConfigurable,
} from "./configurableVisibilityUtils.js";

export const VIEW_SELECTOR_KEY_PREFIX = "v:";

/**
 * @param {import("@genome-spy/core/view/viewSelectors.js").ViewSelector} selector
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
 * @returns {import("@genome-spy/core/view/viewSelectors.js").ViewSelector | undefined}
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
 * @param {import("@genome-spy/core/view/view.js").default} view
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
 * @param {import("@genome-spy/core/view/view.js").default} view
 * @returns {boolean | undefined}
 */
export function getViewVisibilityOverride(visibilities, view) {
    const selectorKey = getViewVisibilityKey(view);
    if (selectorKey && Object.hasOwn(visibilities, selectorKey)) {
        return visibilities[selectorKey];
    }

    const explicitName = view.explicitName;
    if (explicitName && Object.hasOwn(visibilities, explicitName)) {
        return visibilities[explicitName];
    }
}

/**
 * @param {import("./state.js").ViewSettingsPayload | undefined} payload
 * @param {import("@genome-spy/core/view/view.js").default} [viewRoot]
 * @returns {import("./state.js").ViewSettings}
 */
export function normalizeViewSettingsPayload(payload, viewRoot) {
    const { visibilities } = payload ?? {};
    const choices = Array.isArray(visibilities)
        ? Object.fromEntries(
              visibilities
                  .filter(
                      (entry) =>
                          entry &&
                          Array.isArray(entry.scope) &&
                          typeof entry.view === "string" &&
                          typeof entry.visible === "boolean"
                  )
                  .map((entry) => [makeViewSelectorKey(entry), entry.visible])
          )
        : typeof visibilities === "object"
          ? { ...visibilities }
          : {};
    return {
        visibilities: viewRoot
            ? scopedVisibilityChoices(viewRoot, choices)
            : choices,
    };
}

/**
 * @param {import("@genome-spy/core/view/view.js").default} viewRoot
 * @param {Record<string, boolean>} visibilities
 */
function scopedVisibilityChoices(viewRoot, visibilities) {
    /** @type {Record<string, boolean>} */
    const scoped = {};
    for (const [key, value] of Object.entries(visibilities)) {
        const selector = parseViewSelectorKey(key);
        scoped[selector ? makeViewSelectorKey(selector) : key] = value;
    }

    if (viewRoot && Object.keys(visibilities).length) {
        const legacyMatches = new Set();
        visitAddressableViews(viewRoot, (view) => {
            const key = getViewVisibilityKey(view);
            if (!key) return;
            delete scoped[view.explicitName];
            if (view.visibilityIsExpression) {
                delete scoped[key];
            } else if (Object.hasOwn(visibilities, view.explicitName)) {
                if (legacyMatches.has(view.explicitName)) {
                    console.warn(
                        `Legacy visibility key "${view.explicitName}" matches multiple views. Applying to all matches.`
                    );
                }
                legacyMatches.add(view.explicitName);
                scoped[key] ??= visibilities[view.explicitName];
            }
        });
    }
    return scoped;
}

/**
 * @param {import("@genome-spy/core/view/view.js").default} viewRoot
 * @param {Record<string, boolean>} visibilities
 * @returns {import("./state.js").ViewVisibilityEntry[]}
 */
export function buildViewVisibilityEntries(viewRoot, visibilities) {
    return Object.entries(
        scopedVisibilityChoices(viewRoot, visibilities)
    ).flatMap(([key, visible]) => {
        const selector = parseViewSelectorKey(key);
        return selector ? [{ ...selector, visible }] : [];
    });
}

/**
 * @param {import("@genome-spy/core/view/view.js").default} viewRoot
 * @param {import("./state.js").ViewSettings} viewSettings
 * @returns {import("./state.js").ViewSettingsPayload | undefined}
 */
export function buildViewSettingsPayload(viewRoot, viewSettings) {
    const entries = buildViewVisibilityEntries(
        viewRoot,
        viewSettings.visibilities
    );
    if (!entries.length) {
        return;
    }

    return {
        visibilities: entries,
    };
}

/**
 * @param {import("@genome-spy/core/view/view.js").default} viewRoot
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
 * @param {import("@genome-spy/core/view/view.js").default} viewRoot
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
 * @param {import("@genome-spy/core/view/view.js").default} viewRoot
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
 * @param {import("@genome-spy/core/view/view.js").default} viewRoot
 * @returns {Map<string, { view: import("@genome-spy/core/view/view.js").default, selectorKey: string }[]>}
 */
function collectRadioVisibilityGroups(viewRoot) {
    /**
     * @type {Map<string, { view: import("@genome-spy/core/view/view.js").default, selectorKey: string }[]>}
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
