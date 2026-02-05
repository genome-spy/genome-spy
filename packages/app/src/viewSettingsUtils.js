import {
    getViewSelector,
    visitAddressableViews,
} from "@genome-spy/core/view/viewSelectors.js";

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
    } catch (error) {
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
    if (selectorKey && hasOwn(visibilities, selectorKey)) {
        return visibilities[selectorKey];
    }

    const explicitName = view.explicitName;
    if (explicitName && hasOwn(visibilities, explicitName)) {
        return visibilities[explicitName];
    }
}

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
 * @param {Record<string, boolean>} entries
 * @param {string} key
 * @returns {boolean}
 */
function hasOwn(entries, key) {
    return Object.prototype.hasOwnProperty.call(entries, key);
}
