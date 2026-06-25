/**
 * @typedef {import("./view.js").default} View
 */

/** @type {WeakMap<View, ViewIdentityRegistry>} */
const registriesByRoot = new WeakMap();

/**
 * Returns the shared runtime identity registry for a view hierarchy.
 *
 * The registry is keyed by the root view instead of being global because view
 * ids are only meaningful inside one embedded GenomeSpy runtime. This keeps
 * independent embeds isolated while still allowing optional tools, such as the
 * inspector and the public view API, to agree on ids for the same live views.
 *
 * The WeakMap avoids adding debug-only fields to View instances and lets the
 * registry disappear when the root hierarchy is released.
 *
 * @param {View} root
 * @returns {ViewIdentityRegistry}
 */
export function getViewIdentityRegistry(root) {
    let registry = registriesByRoot.get(root);
    if (!registry) {
        registry = new ViewIdentityRegistry();
        registriesByRoot.set(root, registry);
    }

    return registry;
}

/**
 * Allocates runtime-stable ids for View object identities.
 *
 * Ids are intentionally synthetic. They are stable for the lifetime of the
 * root view hierarchy, but they are not persisted and must not be used as
 * bookmarks across reloads.
 */
export class ViewIdentityRegistry {
    /** @type {WeakMap<View, string>} */
    #idsByView = new WeakMap();

    /** @type {Map<string, View>} */
    #viewsById = new Map();

    #nextId = 0;

    /**
     * @param {View} view
     * @returns {string}
     */
    getId(view) {
        let id = this.#idsByView.get(view);
        if (!id) {
            id = "view-" + String(this.#nextId);
            this.#nextId++;
            this.#idsByView.set(view, id);
            this.#viewsById.set(id, view);
        }

        return id;
    }

    /**
     * @param {string} id
     * @returns {View | undefined}
     */
    getView(id) {
        return this.#viewsById.get(id);
    }
}
