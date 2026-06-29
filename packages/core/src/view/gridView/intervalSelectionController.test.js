import { describe, expect, test, vi } from "vitest";
import { IntervalSelectionController } from "./intervalSelectionController.js";

describe("IntervalSelectionController", () => {
    test("removes registered view interaction listeners on dispose", () => {
        /** @type {{ type: string, listener: Function, capture?: boolean }[]} */
        const listeners = [];
        const gridChild = /** @type {any} */ ({
            view: {
                addInteractionListener(
                    /** @type {string} */ type,
                    /** @type {Function} */ listener,
                    /** @type {boolean | undefined} */ capture
                ) {
                    listeners.push({ type, listener, capture });
                },
                removeInteractionListener: vi.fn(
                    (
                        /** @type {string} */ type,
                        /** @type {Function} */ listener,
                        /** @type {boolean | undefined} */ capture
                    ) => {
                        const index = listeners.findIndex(
                            (entry) =>
                                entry.type === type &&
                                entry.listener === listener &&
                                entry.capture === capture
                        );
                        if (index >= 0) {
                            listeners.splice(index, 1);
                        }
                    }
                ),
            },
        });

        const controller = Object.create(IntervalSelectionController.prototype);
        controller.gridChild = gridChild;
        controller.viewListeners = [];

        controller.addViewInteractionListener("mousedown", vi.fn());
        controller.addViewInteractionListener("click", vi.fn(), true);
        expect(listeners).toHaveLength(2);

        controller.dispose();

        expect(gridChild.view.removeInteractionListener).toHaveBeenCalledTimes(
            2
        );
        expect(listeners).toHaveLength(0);
    });
});
