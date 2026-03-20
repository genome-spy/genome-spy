import { describe, expect, test, vi } from "vitest";
import {
    propagateInteraction,
    propagateInteractionSurface,
} from "./interactionRouting.js";

describe("propagateInteraction", () => {
    test("runs capture, handler, and bubble in order", () => {
        /** @type {string[]} */
        const calls = [];
        const view = /** @type {any} */ ({
            handleInteractionEvent(event, capturing) {
                expect(event.type).toBe("mousemove");
                calls.push(capturing ? "capture" : "bubble");
            },
        });
        const event = /** @type {any} */ ({
            type: "mousemove",
            stopped: false,
        });

        propagateInteraction(view, event, () => {
            calls.push("handler");
        });

        expect(calls).toEqual(["capture", "handler", "bubble"]);
    });

    test("skips the handler and bubble phase when capture stops propagation", () => {
        const handler = vi.fn();
        const view = /** @type {any} */ ({
            handleInteractionEvent(event, capturing) {
                if (capturing) {
                    event.stopped = true;
                }
            },
        });
        const event = /** @type {any} */ ({
            type: "mousemove",
            stopped: false,
        });

        propagateInteraction(view, event, handler);

        expect(handler).not.toHaveBeenCalled();
    });
});

describe("propagateInteractionSurface", () => {
    test("runs post-propagation logic only after a hit", () => {
        /** @type {string[]} */
        const calls = [];
        const event = /** @type {any} */ ({ stopped: false });

        const handled = propagateInteractionSurface(
            event,
            () => true,
            () => {
                calls.push("propagate");
            },
            () => {
                calls.push("after");
            }
        );

        expect(handled).toBe(true);
        expect(calls).toEqual(["propagate", "after"]);
    });

    test("skips post-propagation logic when propagation stops the event", () => {
        const afterPropagate = vi.fn();
        const event = /** @type {any} */ ({ stopped: false });

        const handled = propagateInteractionSurface(
            event,
            () => true,
            () => {
                event.stopped = true;
            },
            afterPropagate
        );

        expect(handled).toBe(true);
        expect(afterPropagate).not.toHaveBeenCalled();
    });
});
