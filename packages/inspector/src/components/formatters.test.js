import { describe, expect, test } from "vitest";
import {
    formatFlowNodeState,
    formatRecord,
    formatValue,
} from "./formatters.js";

describe("inspector formatters", () => {
    test("formats empty and populated records", () => {
        expect(formatRecord({})).toBe("-");
        expect(formatRecord({ x: "r1", color: "r2" })).toBe("x: r1, color: r2");
    });

    test("formats missing, scalar, and object values", () => {
        expect(formatValue(undefined)).toBe("-");
        expect(formatValue("ready")).toBe("ready");
        expect(formatValue({ count: 2 })).toBe('{"count":2}');
    });

    test("formats flow node lifecycle state", () => {
        expect(formatFlowNodeState({ disposed: true })).toBe("disposed");
        expect(
            formatFlowNodeState({ disposed: false, initialized: false })
        ).toBe("new");
        expect(
            formatFlowNodeState({
                disposed: false,
                initialized: true,
                completed: true,
            })
        ).toBe("done");
        expect(
            formatFlowNodeState({
                disposed: false,
                initialized: true,
                completed: false,
            })
        ).toBe("active");
    });
});
