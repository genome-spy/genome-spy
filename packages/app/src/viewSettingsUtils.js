import {
    getImportScopeInfo,
    getViewSelector,
    resolveViewSelector,
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
 * @param {string} [selectorKey]
 * @returns {boolean | undefined}
 */
export function getViewVisibilityOverride(
    visibilities,
    view,
    selectorKey = getViewVisibilityKey(view)
) {
    if (selectorKey && Object.hasOwn(visibilities, selectorKey)) {
        return visibilities[selectorKey];
    }

    const explicitName = view.explicitName;
    if (
        explicitName &&
        Object.hasOwn(visibilities, explicitName) &&
        !parseViewSelectorKey(explicitName)
    ) {
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
    /** @type {Set<string>} */
    const legacyNames = new Set();
    for (const [key, value] of Object.entries(visibilities)) {
        const selector = parseViewSelectorKey(key);
        if (!selector) legacyNames.add(key);
        scoped[selector ? makeViewSelectorKey(selector) : key] = value;
    }

    if (viewRoot && Object.keys(visibilities).length) {
        const legacyMatches = new Set();
        visitAddressableViews(viewRoot, (view) => {
            const name = view.explicitName;
            const key = getViewVisibilityKey(view);
            if (!key) return;
            const hasLegacyChoice = legacyNames.has(name);
            if (hasLegacyChoice) delete scoped[name];
            if (view.visibilityIsExpression) {
                delete scoped[key];
            } else if (hasLegacyChoice) {
                if (legacyMatches.has(name)) {
                    console.warn(
                        `Legacy visibility key "${name}" matches multiple views. Applying to all matches.`
                    );
                }
                legacyMatches.add(name);
                scoped[key] ??= visibilities[name];
            }
        });
    }
    return scoped;
}

/**
 * @param {import("@genome-spy/core/view/view.js").default} viewRoot
 * @param {import("./state.js").ViewSettings} viewSettings
 * @returns {import("./state.js").ViewSettingsPayload | undefined}
 */
export function buildViewSettingsPayload(viewRoot, viewSettings) {
    const visibilities = Object.entries(
        scopedVisibilityChoices(viewRoot, viewSettings.visibilities)
    ).flatMap(([key, visible]) => {
        const selector = parseViewSelectorKey(key);
        return selector ? [{ ...selector, visible }] : [];
    });
    return visibilities.length ? { visibilities } : undefined;
}

/**
 * @param {import("@genome-spy/core/view/view.js").default} viewRoot
 */
export function getViewVisibilityKeys(viewRoot) {
    /** @type {Map<import("@genome-spy/core/view/view.js").default, string>} */
    const keys = new Map();
    visitAddressableViews(viewRoot, (view) => {
        if (!view.explicitName || view.visibilityIsExpression) return;
        const selector = getViewSelector(view);
        if (resolveViewSelector(viewRoot, selector, true) === view)
            keys.set(view, makeViewSelectorKey(selector));
    });
    return keys;
}

/**
 * Returns radio-group membership information by selector key.
 *
 * @param {import("@genome-spy/core/view/view.js").default} viewRoot
 * @param {ReturnType<typeof getViewVisibilityKeys>} [viewKeys]
 * @returns {Map<string, { groupKey: string, memberKeys: string[] }>}
 */
export function getRadioVisibilityGroupsBySelector(
    viewRoot,
    viewKeys = getViewVisibilityKeys(viewRoot)
) {
    /** @type {Map<string, { groupKey: string, memberKeys: string[] }>} */
    const bySelector = new Map();

    for (const [groupKey, members] of collectRadioVisibilityGroups(viewKeys)) {
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
 * @param {ReturnType<typeof getViewVisibilityKeys>} [viewKeys]
 * @returns {Record<string, boolean>}
 */
export function resolveRadioVisibilityConflicts(
    viewRoot,
    visibilities,
    viewKeys = getViewVisibilityKeys(viewRoot)
) {
    /** @type {Record<string, boolean>} */
    const resolved = { ...visibilities };

    for (const members of collectRadioVisibilityGroups(viewKeys).values()) {
        const visibleMembers = members.filter((member) => {
            const override = getViewVisibilityOverride(
                visibilities,
                member.view,
                member.selectorKey
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
 * @param {ReturnType<typeof getViewVisibilityKeys>} viewKeys
 * @returns {Map<string, { view: import("@genome-spy/core/view/view.js").default, selectorKey: string }[]>}
 */
function collectRadioVisibilityGroups(viewKeys) {
    /**
     * @type {Map<string, { view: import("@genome-spy/core/view/view.js").default, selectorKey: string }[]>}
     */
    const groups = new Map();

    for (const [view, selectorKey] of viewKeys) {
        if (!isVisibilityConfigurable(view)) continue;
        const group = getVisibilityGroup(view);
        if (!group) continue;

        const selector = getViewSelector(view);
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
    }

    return groups;
}
