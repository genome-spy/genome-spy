import { resolveVisibilityOverrides } from "@genome-spy/core/view/viewSelectors.js";
import { viewSettingsSlice } from "./viewSettingsSlice.js";
import {
    getRadioVisibilityGroupsBySelector,
    getRadioHiddenViews,
    getViewVisibilityKeys,
    normalizeViewSettingsPayload,
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

    /** @type {{ raw: Choices, hidden: Set<View> } | undefined} */
    #radioVisibility;

    /** @type {Map<string, View>} Metadata choices waiting for columns to reappear. */
    #missingMetadataOwners = new Map();

    /** @param {ReturnType<typeof import("./state/setupStore.js").default>} store */
    constructor(store) {
        this.store = store;
    }

    get choices() {
        return this.store.getState().viewSettings.visibilities;
    }

    get hasChoices() {
        return (
            Object.keys(this.choices).length > 0 ||
            this.#root
                .getDescendants()
                .some((view) => view.visibilityOverride !== undefined)
        );
    }

    /**
     * @param {View} root
     * @param {View} [rebuiltSubtree] Preserve choices for generated metadata views across rebuilds and undo.
     */
    updateHierarchy(root, rebuiltSubtree) {
        const keys = getViewVisibilityKeys(root);
        const hiddenBefore = this.#getRadioHiddenViews();
        const previous = this.choices;
        const next = normalizeViewSettingsPayload(
            { visibilities: previous },
            root
        ).visibilities;
        const live = new Set(root.getDescendants());
        for (const [view, key] of this.keys) {
            if (keys.get(view) === key) continue;
            if (live.has(view)) {
                view.visibilityOverride = previous[key];
            } else if (
                rebuiltSubtree &&
                Object.hasOwn(next, key) &&
                view.getLayoutAncestors().includes(rebuiltSubtree)
            ) {
                this.#missingMetadataOwners.set(key, rebuiltSubtree);
                continue;
            }
            delete next[key];
        }
        for (const [view, key] of keys) {
            const metadata = this.#missingMetadataOwners.get(key);
            if (metadata) {
                if (!view.getLayoutAncestors().includes(metadata))
                    delete next[key];
                this.#missingMetadataOwners.delete(key);
            }
            if (view.visibilityOverride !== undefined) {
                next[key] = view.visibilityOverride;
                view.visibilityOverride = undefined;
            }
        }
        for (const [key, metadata] of this.#missingMetadataOwners) {
            if (!live.has(metadata)) {
                delete next[key];
                this.#missingMetadataOwners.delete(key);
            }
        }

        this.#root = root;
        this.keys = keys;
        this.radioGroups = getRadioVisibilityGroupsBySelector(keys);
        this.#radioVisibility = undefined;
        if (
            Object.keys(previous).length !== Object.keys(next).length ||
            Object.keys(next).some((key) => previous[key] !== next[key])
        ) {
            this.#replaceChoices(next);
        } else {
            const hidden = this.#getRadioHiddenViews();
            if (
                hidden.size !== hiddenBefore.size ||
                !hidden.isSubsetOf(hiddenBefore)
            ) {
                root.context.requestVisibilityRefresh?.();
            }
        }
    }

    /**
     * @param {View} view
     * @returns {boolean | undefined}
     */
    getEffectiveOverride(view) {
        return this.#getRadioHiddenViews().has(view)
            ? false
            : this.getOverride(view);
    }

    #getRadioHiddenViews() {
        const raw = this.choices;
        if (this.#radioVisibility?.raw !== raw) {
            this.#radioVisibility = {
                raw,
                hidden: getRadioHiddenViews(this.radioGroups, raw),
            };
        }
        return this.#radioVisibility.hidden;
    }

    /** @param {View} view */
    getOverride(view) {
        const key = this.keys.get(view);
        return key === undefined ? view.visibilityOverride : this.choices[key];
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
            for (const { selectorKey } of radio.members)
                choices[selectorKey] = selectorKey === key;
        } else if (value === undefined) {
            delete choices[key];
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
        this.#missingMetadataOwners.clear();
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
