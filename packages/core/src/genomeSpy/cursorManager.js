/**
 * Resolves and applies the active canvas cursor based on the current mark hover
 * and interaction target path.
 */

/**
 * @typedef {{
 *   getCursorSpec?: () => unknown,
 *   getCursor: () => string | undefined,
 *   watchCursor?: (listener: () => void, registerDisposer: (dispose: () => void) => void) => void,
 * }} CursorOwner
 */

/**
 * @typedef {CursorOwner & {
 *   getLayoutAncestors: () => CursorView[],
 * }} CursorView
 */

export default class CursorManager {
    /** @type {HTMLCanvasElement} */
    #canvas;

    /** @type {CursorOwner | undefined} */
    #activeOwner;

    /** @type {unknown} */
    #activeSpec;

    /** @type {(() => void) | undefined} */
    #disposeActiveOwner;

    /**
     * @param {object} options
     * @param {HTMLCanvasElement} options.canvas
     */
    constructor({ canvas }) {
        this.#canvas = canvas;
    }

    /**
     * @param {object} options
     * @param {CursorView | undefined} options.target
     * @param {{ mark?: CursorOwner } | undefined} options.hover
     */
    update({ target, hover }) {
        this.#setActiveOwner(resolveCursorOwner(target, hover));
    }

    clear() {
        this.#setActiveOwner(undefined);
    }

    /**
     * @param {CursorOwner | undefined} owner
     */
    #setActiveOwner(owner) {
        const spec = owner?.getCursorSpec?.();
        if (this.#activeOwner === owner && this.#activeSpec === spec) {
            this.#applyActiveCursor();
            return;
        }

        this.#disposeActiveOwner?.();
        this.#disposeActiveOwner = undefined;
        this.#activeOwner = owner;
        this.#activeSpec = spec;

        owner?.watchCursor?.(
            () => this.#applyActiveCursor(),
            (dispose) => {
                this.#disposeActiveOwner = dispose;
            }
        );

        this.#applyActiveCursor();
    }

    #applyActiveCursor() {
        const cursor = this.#activeOwner?.getCursor();
        this.#canvas.style.cursor = typeof cursor === "string" ? cursor : "";
    }
}

/**
 * @param {CursorView | undefined} target
 * @param {{ mark?: CursorOwner } | undefined} hover
 * @returns {CursorOwner | undefined}
 */
export function resolveCursorOwner(target, hover) {
    const mark = hover?.mark;
    const markCursor = mark?.getCursorSpec?.();
    if (markCursor !== undefined) {
        return mark;
    }

    for (const view of target?.getLayoutAncestors() ?? []) {
        const cursor = view.getCursorSpec?.();
        if (cursor !== undefined) {
            return view;
        }
    }
}
