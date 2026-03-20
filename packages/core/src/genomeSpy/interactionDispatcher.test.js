import { describe, expect, it, vi } from "vitest";
import Point from "../view/layout/point.js";
import InteractionDispatcher from "./interactionDispatcher.js";

describe("InteractionDispatcher", () => {
    it("dispatches interactions through the view root", () => {
        const propagateInteractionEvent = vi.fn(
            /** @param {import("../utils/interaction.js").default} event */ (
                event
            ) => {
                event.target = /** @type {any} */ ({ name: "unit" });
                event.stopPropagation();
                event.claimWheel();
            }
        );

        const dispatcher = new InteractionDispatcher({
            viewRoot: /** @type {any} */ ({ propagateInteractionEvent }),
        });

        const interaction = dispatcher.dispatch(new Point(1, 2), {
            type: "wheelclaimprobe",
        });

        expect(propagateInteractionEvent).toHaveBeenCalledTimes(1);
        expect(interaction.stopped).toBe(true);
        expect(interaction.wheelClaimed).toBe(true);
        expect(interaction.target).toEqual({ name: "unit" });
    });

    it("synthesizes mouseenter and mouseleave from target path changes", () => {
        /** @type {Array<{ view: string, type: string, relatedTarget?: string, capturing: boolean }>} */
        const calls = [];

        const root = createMockView("root", undefined, calls);
        const a = createMockView("a", root, calls);
        const b = createMockView("b", root, calls);

        const targets = [a, b];
        const dispatcher = new InteractionDispatcher({
            viewRoot: /** @type {any} */ ({
                propagateInteractionEvent(
                    /** @type {import("../utils/interaction.js").default} */ event
                ) {
                    event.target = /** @type {any} */ (targets.shift());
                },
            }),
        });

        dispatcher.dispatch(
            new Point(1, 1),
            /** @type {any} */ ({ type: "mousemove" })
        );
        dispatcher.dispatch(
            new Point(2, 2),
            /** @type {any} */ ({ type: "mousemove" })
        );

        expect(calls).toEqual([
            {
                view: "root",
                type: "mouseenter",
                relatedTarget: undefined,
                capturing: true,
            },
            {
                view: "root",
                type: "mouseenter",
                relatedTarget: undefined,
                capturing: false,
            },
            {
                view: "a",
                type: "mouseenter",
                relatedTarget: undefined,
                capturing: true,
            },
            {
                view: "a",
                type: "mouseenter",
                relatedTarget: undefined,
                capturing: false,
            },
            {
                view: "a",
                type: "mouseleave",
                relatedTarget: "b",
                capturing: true,
            },
            {
                view: "a",
                type: "mouseleave",
                relatedTarget: "b",
                capturing: false,
            },
            {
                view: "b",
                type: "mouseenter",
                relatedTarget: "a",
                capturing: true,
            },
            {
                view: "b",
                type: "mouseenter",
                relatedTarget: "a",
                capturing: false,
            },
        ]);
    });

    it("dispatches mouseleave when the pointer leaves the canvas", () => {
        /** @type {Array<{ view: string, type: string, relatedTarget?: string, capturing: boolean }>} */
        const calls = [];

        const root = createMockView("root", undefined, calls);
        const child = createMockView("child", root, calls);

        const dispatcher = new InteractionDispatcher({
            viewRoot: /** @type {any} */ ({
                propagateInteractionEvent(
                    /** @type {import("../utils/interaction.js").default} */ event
                ) {
                    event.target = /** @type {any} */ (child);
                },
            }),
        });

        dispatcher.dispatch(
            new Point(3, 4),
            /** @type {any} */ ({ type: "mousemove" })
        );
        calls.length = 0;

        dispatcher.handlePointerLeave(
            /** @type {any} */ ({ type: "mouseout" })
        );

        expect(calls).toEqual([
            {
                view: "child",
                type: "mouseleave",
                relatedTarget: undefined,
                capturing: true,
            },
            {
                view: "child",
                type: "mouseleave",
                relatedTarget: undefined,
                capturing: false,
            },
            {
                view: "root",
                type: "mouseleave",
                relatedTarget: undefined,
                capturing: true,
            },
            {
                view: "root",
                type: "mouseleave",
                relatedTarget: undefined,
                capturing: false,
            },
        ]);
    });
});

/**
 * @param {string} name
 * @param {any} layoutParent
 * @param {Array<{ view: string, type: string, relatedTarget?: string, capturing: boolean }>} calls
 */
function createMockView(name, layoutParent, calls) {
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
        handleInteractionEvent(
            /** @type {import("../utils/interaction.js").default} */ event,
            /** @type {boolean} */ capturing
        ) {
            calls.push({
                view: name,
                type: event.type,
                relatedTarget: event.relatedTarget?.name,
                capturing,
            });
        },
    };
}
