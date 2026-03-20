/**
 * Resolves and applies the active canvas cursor based on the current mark hover
 * and interaction target path.
 */
export default class CursorManager {
    /** @type {HTMLCanvasElement} */
    #canvas;

    /** @type {CursorSource | undefined} */
    #activeSource;

    /** @type {(() => void) | undefined} */
    #disposeActiveSource;

    /**
     * @param {object} options
     * @param {HTMLCanvasElement} options.canvas
     */
    constructor({ canvas }) {
        this.#canvas = canvas;
    }

    /**
     * @param {object} options
     * @param {import("../view/view.js").default | undefined} options.target
     * @param {import("../types/viewContext.js").Hover | undefined} options.hover
     */
    update({ target, hover }) {
        this.#setActiveSource(resolveCursorSource(target, hover));
    }

    clear() {
        this.#setActiveSource(undefined);
    }

    /**
     * @param {CursorSource | undefined} source
     */
    #setActiveSource(source) {
        if (sameSource(this.#activeSource, source)) {
            this.#applyActiveCursor();
            return;
        }

        this.#disposeActiveSource?.();
        this.#disposeActiveSource = undefined;
        this.#activeSource = source;

        source?.watch(
            (dispose) => {
                this.#disposeActiveSource = dispose;
            },
            () => this.#applyActiveCursor()
        );

        this.#applyActiveCursor();
    }

    #applyActiveCursor() {
        const cursor = this.#activeSource?.evaluate();
        this.#canvas.style.cursor = typeof cursor === "string" ? cursor : "";
    }
}

/**
 * @typedef {{
 *   owner: object,
 *   raw: unknown,
 *   evaluate: () => string | undefined,
 *   watch: (registerDisposer: (dispose: () => void) => void, listener: () => void) => void,
 * }} CursorSource
 */

/**
 * @param {import("../view/view.js").default | undefined} target
 * @param {import("../types/viewContext.js").Hover | undefined} hover
 * @returns {CursorSource | undefined}
 */
export function resolveCursorSource(target, hover) {
    const mark = hover?.mark;
    const markCursor = mark?.getCursorSpec?.();
    if (markCursor !== undefined) {
        return {
            owner: mark,
            raw: markCursor,
            evaluate: () => mark.getCursor(),
            watch: (registerDisposer, listener) =>
                mark.watchCursor?.(listener, registerDisposer),
        };
    }

    for (const view of target?.getLayoutAncestors() ?? []) {
        const cursor = view.getCursorSpec?.();
        if (cursor !== undefined) {
            return {
                owner: view,
                raw: cursor,
                evaluate: () => view.getCursor(),
                watch: (registerDisposer, listener) =>
                    view.watchCursor?.(listener, registerDisposer),
            };
        }
    }
}

/**
 * @param {CursorSource | undefined} a
 * @param {CursorSource | undefined} b
 */
function sameSource(a, b) {
    if (!a || !b) {
        return a === b;
    }

    return a.owner === b.owner && a.raw === b.raw;
}
