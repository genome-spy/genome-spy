import { describe, expect, it, vi } from "vitest";
import CursorManager from "./cursorManager.js";

describe("CursorManager", () => {
    it("prefers mark cursor over view cursor", () => {
        const canvas = createCanvas();
        const manager = new CursorManager({ canvas });
        const root = createView("root", undefined, "crosshair");
        const child = createView("child", root);
        const mark = createMark("pointer");

        manager.update({
            target: child,
            hover: /** @type {any} */ ({ mark }),
        });

        expect(canvas.style.cursor).toBe("pointer");
    });

    it("falls back to the nearest view cursor in the target path", () => {
        const canvas = createCanvas();
        const manager = new CursorManager({ canvas });
        const root = createView("root", undefined, "crosshair");
        const child = createView("child", root);

        manager.update({
            target: child,
            hover: undefined,
        });

        expect(canvas.style.cursor).toBe("crosshair");
    });

    it("updates an ExprRef-backed cursor without pointer re-entry", () => {
        const canvas = createCanvas();
        const manager = new CursorManager({ canvas });
        const root = createReactiveView("root", undefined, "move");

        manager.update({
            target: root,
            hover: undefined,
        });

        expect(canvas.style.cursor).toBe("move");

        root.setCursorValue("grabbing");

        expect(canvas.style.cursor).toBe("grabbing");
    });

    it("clears the cursor and disposes the active watcher", () => {
        const canvas = createCanvas();
        const manager = new CursorManager({ canvas });
        const root = createReactiveView("root", undefined, "move");

        manager.update({
            target: root,
            hover: undefined,
        });
        manager.clear();

        expect(canvas.style.cursor).toBe("");
        expect(root.dispose).toHaveBeenCalledTimes(1);
    });
});

/**
 * @returns {HTMLCanvasElement}
 */
function createCanvas() {
    return /** @type {HTMLCanvasElement} */ ({
        style: {
            cursor: "",
        },
    });
}

/**
 * @param {string} name
 * @param {any} layoutParent
 * @param {string} [cursor]
 */
function createView(name, layoutParent, cursor) {
    return {
        name,
        layoutParent,
        getLayoutAncestors() {
            const ancestors = [];
            let view = this;
            while (view) {
                ancestors.push(view);
                view = view.layoutParent;
            }
            return ancestors;
        },
        getCursorSpec() {
            return cursor;
        },
        getCursor() {
            return cursor;
        },
        /** @returns {void} */
        watchCursor() {
            return undefined;
        },
    };
}

/**
 * @param {string} name
 * @param {any} layoutParent
 * @param {string} initialCursor
 */
function createReactiveView(name, layoutParent, initialCursor) {
    let cursor = initialCursor;
    /** @type {(() => void) | undefined} */
    let listener;
    const dispose = vi.fn();

    return {
        name,
        layoutParent,
        getLayoutAncestors() {
            const ancestors = [];
            let view = this;
            while (view) {
                ancestors.push(view);
                view = view.layoutParent;
            }
            return ancestors;
        },
        getCursorSpec() {
            return { expr: "cursorParam" };
        },
        getCursor() {
            return cursor;
        },
        watchCursor(
            /** @type {() => void} */ callback,
            /** @type {(dispose: () => void) => void} */ registerDisposer
        ) {
            listener = callback;
            registerDisposer(dispose);
        },
        setCursorValue(/** @type {string} */ value) {
            cursor = value;
            listener?.();
        },
        dispose,
    };
}

/**
 * @param {string} cursor
 */
function createMark(cursor) {
    return {
        getCursorSpec() {
            return cursor;
        },
        getCursor() {
            return cursor;
        },
        /** @returns {void} */
        watchCursor() {
            return undefined;
        },
    };
}
