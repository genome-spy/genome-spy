/**
 * Tracks interaction listeners registered on a view so they can be removed as a
 * group when the owning controller is disposed.
 */
export class ViewInteractionListenerTracker {
    /**
     * @param {import("./view.js").default} view
     */
    constructor(view) {
        this.view = view;
    }

    /** @type {import("./view.js").default} */
    view;

    /**
     * @type {{ type: string, listener: import("./view.js").InteractionListener, capture?: boolean }[]}
     */
    #listeners = [];

    /**
     * @param {string} type
     * @param {import("./view.js").InteractionListener} listener
     * @param {boolean} [capture]
     */
    add(type, listener, capture) {
        this.view.addInteractionListener(type, listener, capture);
        this.#listeners.push({ type, listener, capture });
    }

    dispose() {
        for (const { type, listener, capture } of this.#listeners) {
            this.view.removeInteractionListener(type, listener, capture);
        }
        this.#listeners = [];
    }
}
