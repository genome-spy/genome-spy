import { describe, expect, test } from "vitest";
import {
    asEventConfig,
    createEventPredicate,
    validateEventType,
} from "./interactionConfig.js";

describe("asEventConfig", () => {
    test("parses a simple event type string", () => {
        expect(asEventConfig("click")).toEqual({ type: "click" });
    });

    test("parses a bracketed event filter expression", () => {
        expect(asEventConfig("click[event.shiftKey]")).toEqual({
            type: "click",
            filter: "event.shiftKey",
        });
    });

    test("returns event config objects as-is", () => {
        const config = { type: "mousedown", filter: "event.altKey" };
        expect(asEventConfig(config)).toBe(config);
    });
});

describe("createEventPredicate", () => {
    test("accepts events when no filter is configured", () => {
        const predicate = createEventPredicate({ type: "click" });
        expect(predicate(/** @type {Event} */ ({ type: "click" }))).toBe(true);
    });

    test("evaluates configured event filter expressions", () => {
        const predicate = createEventPredicate({
            type: "click",
            filter: "event.shiftKey",
        });

        expect(predicate(/** @type {Event} */ ({ shiftKey: false }))).toBe(
            false
        );
        expect(predicate(/** @type {Event} */ ({ shiftKey: true }))).toBe(true);
    });
});

describe("validateEventType", () => {
    test("returns the event config when the type is allowed", () => {
        const config = { type: "mousedown" };
        expect(
            validateEventType(config, ["mousedown"], "Example supports only")
        ).toBe(config);
    });

    test("throws with a feature-specific message when the type is not allowed", () => {
        expect(() =>
            validateEventType(
                { type: "click" },
                ["mousedown"],
                "Example supports only mousedown"
            )
        ).toThrow("Example supports only mousedown");
    });
});
