import { describe, it, expect } from "vitest";
import { asEventConfig } from "./selection.js";

describe("asEventSpec", () => {
    it("parses a simple string event type", () => {
        const res = asEventConfig("click");
        expect(res).toEqual({ type: "click" });
    });

    it("parses a string event type with bracket filter", () => {
        const res = asEventConfig("click[event.shiftKey]");
        expect(res).toEqual({ type: "click", filter: "event.shiftKey" });
    });
});
