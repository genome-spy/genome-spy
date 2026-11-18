import { resolveVisibilityOverrides } from "@genome-spy/core/view/viewVisibility.js";
import { viewSettingsSlice } from "./viewSettingsSlice.js";
import {
    getRadioVisibilityGroupsBySelector,
    getViewVisibilityKeys,
    getViewVisibilityOverride,
    normalizeViewSettingsPayload,
    parseViewSelectorKey,
    resolveRadioVisibilityConflicts,
} from "./viewSettingsUtils.js";

/** @typedef {import("@genome-spy/core/view/view.js").default} View */
/** @typedef {import("./state.js").ViewSettings["visibilities"]} Choices */

export default class ViewVisibilitySettings {
    /** @type {ReturnType<typeof getViewVisibilityKeys>} */
    keys = new Map();

    /** @type {ReturnType<typeof getRadioVisibilityGroupsBySelector>} */
    radioGroups = new Map();

    /** @type {View} */
    #root;

    /** @type {{ raw: Choices, resolved: Choices } | undefined} */
    #effective;

    /** @param {ReturnType<typeof import("./state/setupStore.js").default>} store */
    constructor(store) {
        this.store = store;
    }

    get choices() {
        return this.store.getState().viewSettings.visibilities;
    }

    /** @param {View} root */
    updateHierarchy(root) {
        const keys = getViewVisibilityKeys(root);
        const previous = this.choices;
        const next = { ...previous };
        const live = new Set(root.getDescendants());
        for (const [view, key] of this.keys) {
            if (keys.get(view) === key) continue;
            if (live.has(view)) {
                view.visibilityOverride = getViewVisibilityOverride(
                    previous,
                    view,
                    key
                );
            }
            delete next[key];
        }
        for (const [view, key] of keys) {
            if (view.visibilityOverride !== undefined) {
                next[key] = view.visibilityOverride;
                view.visibilityOverride = undefined;
            }
        }

        this.#root = root;
        this.keys = keys;
        this.radioGroups = getRadioVisibilityGroupsBySelector(root, keys);
        this.#effective = undefined;
        if (
            Object.keys(previous).length !== Object.keys(next).length ||
            Object.keys(next).some((key) => previous[key] !== next[key])
        ) {
            this.#replaceChoices(next);
        }
    }

    /**
     * @param {View} view
     * @returns {boolean | undefined}
     */
    getEffectiveOverride(view) {
        const key = this.keys.get(view);
        if (key === undefined) return;
        const raw = this.choices;
        if (this.#effective?.raw !== raw) {
            this.#effective = {
                raw,
                resolved: resolveRadioVisibilityConflicts(
                    this.#root,
                    raw,
                    this.keys
                ),
            };
        }
        return getViewVisibilityOverride(this.#effective.resolved, view, key);
    }

    /** @param {View} view */
    getOverride(view) {
        const key = this.keys.get(view);
        return key === undefined
            ? view.visibilityOverride
            : getViewVisibilityOverride(this.choices, view, key);
    }

    /**
     * @param {View} view
     * @param {boolean | undefined} value
     */
    setOverride(view, value) {
        const key = this.keys.get(view);
        if (key === undefined) {
            view.visibilityOverride = value;
            return;
        }

        const choices = { ...this.choices };
        const radio = value === true && this.radioGroups.get(key);
        if (radio) {
            for (const member of radio.memberKeys)
                choices[member] = member === key;
        } else if (value === undefined) {
            delete choices[key];
            if (!parseViewSelectorKey(view.explicitName))
                delete choices[view.explicitName];
        } else {
            choices[key] = value;
        }
        this.#replaceChoices(choices);
    }

    /** @param {readonly import("@genome-spy/core/types/embedApi.js").ViewVisibilityOverride[]} overrides */
    seedChoices(overrides) {
        const choices = { ...this.choices };
        for (const [view, visible] of resolveVisibilityOverrides(
            this.#root,
            overrides
        )) {
            const key = this.keys.get(view);
            if (key !== undefined) choices[key] = visible;
        }
        this.#replaceChoices(choices);
    }

    /** @param {import("./state.js").ViewSettingsPayload | undefined} payload */
    restoreChoices(payload) {
        this.#root.visit((view) => {
            view.visibilityOverride = undefined;
        });
        this.#replaceChoices(
            normalizeViewSettingsPayload(payload, this.#root).visibilities
        );
    }

    /** @param {Choices} visibilities */
    #replaceChoices(visibilities) {
        this.store.dispatch(
            viewSettingsSlice.actions.setViewSettings({ visibilities })
        );
    }
}
