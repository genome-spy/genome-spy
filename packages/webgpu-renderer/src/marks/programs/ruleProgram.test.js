import { expect, it, vi } from "vitest";
import { createMockRenderer } from "../../testUtils/mockRenderer.js";
import RuleProgram from "./ruleProgram.js";

it("warns for out-of-range ordinary and typed dash indices alike", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
        for (const value of [[2], new Uint32Array([2])]) {
            const program = new RuleProgram(createMockRenderer(), {
                count: 1,
                dashPatterns: [[4, 4]],
                channels: {
                    x: { value: 0 },
                    x2: { value: 10 },
                    y: { value: 0 },
                    y2: { value: 0 },
                    strokeDash: { value },
                },
            });
            program.destroy();
        }
        expect(warn.mock.calls).toEqual([
            ["[webgpu-renderer] strokeDash value 2 exceeds pattern count 1."],
            ["[webgpu-renderer] strokeDash value 2 exceeds pattern count 1."],
        ]);
    } finally {
        warn.mockRestore();
    }
});
