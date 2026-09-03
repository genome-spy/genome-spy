import { describe, expect, test, vi } from "vitest";

import RenderPassState from "./renderPassState.js";

describe("RenderPassState", () => {
    test("uses object identity and dynamic offsets for pipeline and bindings", () => {
        const pass = createPass();
        const state = new RenderPassState(
            /** @type {GPURenderPassEncoder} */ (/** @type {unknown} */ (pass))
        );
        const firstPipeline = /** @type {GPURenderPipeline} */ ({});
        const secondPipeline = /** @type {GPURenderPipeline} */ ({});
        const bindGroup = /** @type {GPUBindGroup} */ ({});

        state.setPipeline(firstPipeline);
        state.setPipeline(firstPipeline);
        state.setPipeline(secondPipeline);
        state.setBindGroup(1, bindGroup);
        state.setBindGroup(1, bindGroup);
        state.setBindGroup(0, bindGroup, [256]);
        state.setBindGroup(0, bindGroup, [256]);
        state.setBindGroup(0, bindGroup, [512]);

        expect(pass.setPipeline.mock.calls).toEqual([
            [firstPipeline],
            [secondPipeline],
        ]);
        expect(pass.setBindGroup.mock.calls).toEqual([
            [1, bindGroup],
            [0, bindGroup, [256]],
            [0, bindGroup, [512]],
        ]);
    });

    test("compares effective viewport and scissor values", () => {
        const pass = createPass();
        const state = new RenderPassState(
            /** @type {GPURenderPassEncoder} */ (/** @type {unknown} */ (pass))
        );

        state.setViewport(1, 2, 30, 40, 0, 1);
        state.setViewport(1, 2, 30, 40, 0, 1);
        state.setViewport(1, 2, 31, 40, 0, 1);
        state.setScissorRect(3, 4, 50, 60);
        state.setScissorRect(3, 4, 50, 60);
        state.setScissorRect(3, 5, 50, 60);

        expect(pass.setViewport.mock.calls).toEqual([
            [1, 2, 30, 40, 0, 1],
            [1, 2, 31, 40, 0, 1],
        ]);
        expect(pass.setScissorRect.mock.calls).toEqual([
            [3, 4, 50, 60],
            [3, 5, 50, 60],
        ]);
    });
});

function createPass() {
    return {
        setPipeline: vi.fn(),
        setBindGroup: vi.fn(),
        setViewport: vi.fn(),
        setScissorRect: vi.fn(),
    };
}
