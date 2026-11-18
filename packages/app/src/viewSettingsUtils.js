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
        : Object.fromEntries(
              Object.entries(visibilities ?? {}).filter(
                  ([, value]) => typeof value === "boolean"
              )
          );
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
        if (
            !selector.scope.includes("") &&
            resolveViewSelector(viewRoot, selector, true) === view
        )
            keys.set(view, makeViewSelectorKey(selector));
    });
    return keys;
}

/**
 * @typedef {import("@genome-spy/core/view/view.js").default} View
 * @typedef {{groupKey: string, members: {view: View, selectorKey: string}[]}} RadioGroup
 */

/**
 * Each member's selector key points to the same group in view order.
 * @param {ReturnType<typeof getViewVisibilityKeys>} viewKeys
 */
export function getRadioVisibilityGroupsBySelector(viewKeys) {
    /** @type {Map<string, RadioGroup>} */
    const groups = new Map();

    /** @type {Map<string, RadioGroup>} */
    const bySelector = new Map();
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

        const entry = groups.get(groupKey) ?? { groupKey, members: [] };
        entry.members.push({ view, selectorKey });
        groups.set(groupKey, entry);
        bySelector.set(selectorKey, entry);
    }
    return bySelector;
}

/**
 * The first visible choice in each group wins. These hidden views have no new
 * explicit choice to persist.
 * @param {Map<string, RadioGroup>} groups
 * @param {Record<string, boolean>} choices
 */
export function getRadioHiddenViews(groups, choices) {
    /** @type {Set<View>} */
    const hidden = new Set();
    for (const { members } of new Set(groups.values())) {
        let selected = false;
        for (const { view, selectorKey } of members) {
            if (!(choices[selectorKey] ?? view.isVisibleInSpec())) continue;
            if (selected) hidden.add(view);
            selected = true;
        }
    }
    return hidden;
}
