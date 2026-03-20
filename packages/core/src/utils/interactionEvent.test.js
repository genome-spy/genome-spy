import { describe, it, expect } from "vitest";
import InteractionEvent, {
    createPrimitiveEventProxy,
} from "./interactionEvent.js";
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

describe("InteractionEvent wheel claiming", () => {
    it("allows claiming wheel for wheel probe events", () => {
        const event = new InteractionEvent(new Point(0, 0), {
            type: "wheelclaimprobe",
        });

        event.claimWheel();

        expect(event.wheelClaimed).toBe(true);
    });

    it("rejects claiming wheel for non-wheel events", () => {
        const event = new InteractionEvent(
            new Point(0, 0),
            /** @type {any} */ ({ type: "click" })
        );

        expect(() => event.claimWheel()).toThrow(
            "Can claim wheel only for wheel events!"
        );
    });
});

describe("InteractionEvent adapter", () => {
    it("proxies state changes to the wrapped Interaction", () => {
        const interaction = new Interaction(new Point(0, 0), {
            type: "wheelclaimprobe",
        });
        const event = new InteractionEvent(interaction);

        event.stopPropagation();
        event.claimWheel();
        event.target = /** @type {any} */ ({ name: "unit" });
        event.uiEvent = /** @type {any} */ ({ type: "click" });

        expect(interaction.stopped).toBe(true);
        expect(interaction.wheelClaimed).toBe(true);
        expect(interaction.target).toEqual({ name: "unit" });
        expect(interaction.type).toBe("click");
    });

    it("overrides wheel deltas without replacing the wrapped uiEvent", () => {
        const wheelEvent = {
            type: "wheel",
            deltaX: 12,
            deltaY: -8,
            deltaMode: 0,
            ctrlKey: false,
            preventDefault() {},
        };
        const interaction = new Interaction(new Point(0, 0), wheelEvent);
        const event = new InteractionEvent(interaction);

        event.setWheelDeltas(wheelEvent.deltaX, 0);

        expect(event.uiEvent).toBe(wheelEvent);
        expect(interaction.uiEvent).toBe(wheelEvent);
        expect(event.wheelEvent.deltaX).toBe(12);
        expect(event.wheelEvent.deltaY).toBe(0);
        expect(interaction.wheelEvent.deltaY).toBe(0);
    });
});
