import { describe, expect, it, vi } from "vitest";

import { SelectionResourceManager } from "./selectionResources.js";
import { SELECTION_BUFFER_PREFIX } from "../../../wgsl/prefixes.js";

describe("SelectionResourceManager", () => {
    it("destroys a superseded multi-selection buffer", () => {
        /** @type {Array<{ size: number, destroy: ReturnType<typeof vi.fn> }>} */
        const buffers = [];
        const device = /** @type {GPUDevice} */ (
            /** @type {unknown} */ ({
                createBuffer: (/** @type {GPUBufferDescriptor} */ { size }) => {
                    const buffer = { size, destroy: vi.fn() };
                    buffers.push(buffer);
                    return buffer;
                },
                queue: { writeBuffer: vi.fn() },
            })
        );
        const channels =
            /** @type {Record<string, import("../../../index.d.ts").ChannelConfigResolved>} */ (
                /** @type {unknown} */ ({
                    uniqueId: {
                        data: new Uint32Array([0]),
                        type: "u32",
                        components: 1,
                    },
                    fill: {
                        value: [0, 0, 0, 1],
                        type: "f32",
                        components: 4,
                        conditions: [
                            {
                                when: { selection: "chosen", type: "multi" },
                                channel: {
                                    value: [1, 0, 0, 1],
                                    type: "f32",
                                    components: 4,
                                },
                                channelName: "fill__cond0",
                            },
                        ],
                    },
                    fill__cond0: {
                        value: [1, 0, 0, 1],
                        type: "f32",
                        components: 4,
                    },
                })
            );
        const manager = new SelectionResourceManager({
            device,
            channels,
            setUniformValue: vi.fn(),
        });
        const extraBuffers = new Map();
        manager.initializeSelections(extraBuffers);

        const needsRebind = manager.updateSelection(
            "chosen",
            { type: "multi", ids: new Uint32Array([1, 2, 3, 4]) },
            extraBuffers
        );

        expect(needsRebind).toBe(true);
        expect(buffers[0].destroy).toHaveBeenCalledOnce();
        expect(extraBuffers.get(SELECTION_BUFFER_PREFIX + "chosen")).toBe(
            buffers[1]
        );
    });
});
