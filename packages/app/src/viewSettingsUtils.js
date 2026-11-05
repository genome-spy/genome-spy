/** App save/load conversion; live visibility rules belong to Core. */
import { visitAddressableViews } from "@genome-spy/core/view/viewSelectors.js";
import {
    makeViewSelectorKey,
    parseViewSelectorKey,
    getViewVisibilityKey,
    resolveRadioVisibilityConflicts,
} from "@genome-spy/core/view/viewVisibilityUtils.js";
export {
    VIEW_SELECTOR_KEY_PREFIX,
    makeViewSelectorKey,
    parseViewSelectorKey,
    getViewVisibilityKey,
    getViewVisibilityOverride,
    getUniqueViewSelectorKeys,
    getRadioVisibilityGroupsBySelector,
    resolveRadioVisibilityConflicts,
} from "@genome-spy/core/view/viewVisibilityUtils.js";

/**
 * @param {import("./state.js").ViewSettingsPayload | undefined} payload
 * @returns {import("./state.js").ViewSettings}
 */
export function normalizeViewSettingsPayload(payload) {
    if (!payload || !payload.visibilities) {
        return { visibilities: {} };
    }

    const visibilities = payload.visibilities;

    if (Array.isArray(visibilities)) {
        /** @type {Record<string, boolean>} */
        const normalized = {};

        for (const entry of visibilities) {
            if (
                !entry ||
                !Array.isArray(entry.scope) ||
                typeof entry.view !== "string"
            ) {
                continue;
            }

            if (typeof entry.visible !== "boolean") {
                continue;
            }

            normalized[
                makeViewSelectorKey({
                    scope: entry.scope,
                    view: entry.view,
                })
            ] = entry.visible;
        }

        return { visibilities: normalized };
    }

    if (typeof visibilities === "object") {
        return { visibilities: { ...visibilities } };
    }

    return { visibilities: {} };
}

/**
 * @param {import("@genome-spy/core/view/view.js").default} viewRoot
 * @param {Record<string, boolean>} visibilities
 * @returns {import("./state.js").ViewVisibilityEntry[]}
 */
export function buildViewVisibilityEntries(viewRoot, visibilities) {
    /** @type {Map<string, boolean>} */
    const selectorEntries = new Map();

    for (const [key, value] of Object.entries(visibilities)) {
        const selector = parseViewSelectorKey(key);
        if (selector) {
            selectorEntries.set(makeViewSelectorKey(selector), value);
        }
    }

    const legacyKeys = Object.keys(visibilities).filter(
        (key) => !parseViewSelectorKey(key)
    );

    if (legacyKeys.length && viewRoot) {
        const legacyKeySet = new Set(legacyKeys);
        /** @type {Map<string, import("@genome-spy/core/view/view.js").default[]>} */
        const legacyMatches = new Map();

        visitAddressableViews(viewRoot, (view) => {
            const explicitName = view.explicitName;
            if (!explicitName || !legacyKeySet.has(explicitName)) {
                return;
            }

            const matches = legacyMatches.get(explicitName) ?? [];
            matches.push(view);
            legacyMatches.set(explicitName, matches);
        });

        for (const legacyKey of legacyKeys) {
            const matches = legacyMatches.get(legacyKey) ?? [];
            if (!matches.length) {
                continue;
            }

            if (matches.length > 1) {
                console.warn(
                    'Legacy visibility key "' +
                        legacyKey +
                        '" matches multiple views. Applying to all matches.'
                );
            }

            for (const view of matches) {
                const selectorKey = getViewVisibilityKey(view);
                if (!selectorKey || selectorEntries.has(selectorKey)) {
                    continue;
                }
                selectorEntries.set(selectorKey, visibilities[legacyKey]);
            }
        }
    }

    /** @type {import("./state.js").ViewVisibilityEntry[]} */
    const entries = [];

    for (const [key, value] of selectorEntries) {
        const selector = parseViewSelectorKey(key);
        if (!selector) {
            continue;
        }

        entries.push({
            scope: selector.scope,
            view: selector.view,
            visible: value,
        });
    }

    return entries;
}

/**
 * @param {import("@genome-spy/core/view/view.js").default} viewRoot
 * @param {import("./state.js").ViewSettings} viewSettings
 * @returns {import("./state.js").ViewSettingsPayload | undefined}
 */
export function buildViewSettingsPayload(viewRoot, viewSettings) {
    const resolvedVisibilities = resolveRadioVisibilityConflicts(
        viewRoot,
        viewSettings.visibilities
    );
    const entries = buildViewVisibilityEntries(viewRoot, resolvedVisibilities);
    if (!entries.length) {
        return;
    }

    return {
        visibilities: entries,
    };
}
