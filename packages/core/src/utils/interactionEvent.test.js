import { describe, it, expect } from "vitest";
import { createPrimitiveEventProxy } from "./interactionEvent.js";
import Interaction from "./interaction.js";
import Point from "../view/layout/point.js";

describe("createPrimitiveEventProxy", () => {
    it("exposes primitive properties and hides non-primitives", () => {
        const mock = {
            type: "click",
            clientX: 42,
            meta: { foo: "bar" },
            nested: { a: 1 },
        };

        /** @type {any} */
        const proxy = createPrimitiveEventProxy(mock);

        // allowed primitives
        expect(proxy.type).toBe("click");
        expect(proxy.clientX).toBe(42);

        // non-primitive access throws
        expect(() => proxy.meta).toThrow(/non-primitive/);

        // keys enumeration hides non-primitives
        const keys = Object.keys(proxy);
        expect(keys).toContain("type");
        expect(keys).not.toContain("meta");

        // `in` operator respects the policy
        expect("type" in proxy).toBe(true);
        expect("meta" in proxy).toBe(false);

        // prototype is hidden
        expect(Object.getPrototypeOf(proxy)).toBeNull();
    });
});

describe("Interaction wheel claiming", () => {
    it("allows claiming wheel for wheel probe events", () => {
        const event = new Interaction(new Point(0, 0), {
            type: "wheelclaimprobe",
        });

        event.claimWheel();

        expect(event.wheelClaimed).toBe(true);
    });

    it("rejects claiming wheel for non-wheel events", () => {
        const event = new Interaction(
            new Point(0, 0),
            /** @type {any} */ ({ type: "click" })
        );

        expect(() => event.claimWheel()).toThrow(
            "Can claim wheel only for wheel events!"
        );
    });
});

describe("Interaction", () => {
    it("mutates interaction state directly", () => {
        const interaction = new Interaction(new Point(0, 0), {
            type: "wheelclaimprobe",
        });

        interaction.stopPropagation();
        interaction.claimWheel();
        interaction.target = /** @type {any} */ ({ name: "unit" });
        interaction.uiEvent = /** @type {any} */ ({ type: "click" });

        expect(interaction.stopped).toBe(true);
        expect(interaction.wheelClaimed).toBe(true);
        expect(interaction.target).toEqual({ name: "unit" });
        expect(interaction.type).toBe("click");
    });

    it("overrides wheel deltas without replacing the wrapped uiEvent", () => {
        /** @type {import("./interactionEvent.js").WheelLikeEvent} */
        const wheelEvent = {
            type: "wheel",
            deltaX: 12,
            deltaY: -8,
            deltaMode: 0,
            ctrlKey: false,
            preventDefault() {},
        };
        const interaction = new Interaction(new Point(0, 0), wheelEvent);

        interaction.setWheelDeltas(wheelEvent.deltaX, 0);

        expect(interaction.uiEvent).toBe(wheelEvent);
        expect(interaction.wheelEvent.deltaX).toBe(12);
        expect(interaction.wheelEvent.deltaY).toBe(0);
    });

    it("preserves native-style accessor and method receivers in overridden wheel events", () => {
        let preventDefaultCalled = false;

        const wheelEvent = {
            type: "wheel",
            deltaX: 12,
            deltaY: -8,
            ctrlKey: false,
            get deltaMode() {
                if (this !== wheelEvent) {
                    throw new TypeError("Illegal invocation");
                }

                return 1;
            },
            preventDefault() {
                if (this !== wheelEvent) {
                    throw new TypeError("Illegal invocation");
                }

                preventDefaultCalled = true;
            },
        };

        const interaction = new Interaction(
            new Point(0, 0),
            /** @type {import("./interactionEvent.js").WheelLikeEvent} */ (
                wheelEvent
            )
        );

        interaction.setWheelDeltas(4, 0);

        expect(interaction.wheelEvent.deltaMode).toBe(1);
        interaction.wheelEvent.preventDefault();
        expect(preventDefaultCalled).toBe(true);
    });
});
