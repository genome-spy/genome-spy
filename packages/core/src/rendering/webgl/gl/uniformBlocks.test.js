import { expect, test, vi } from "vitest";
import { createUniformBlockInfo } from "./uniformBlocks.js";

// Include the point and text block layouts reported by the affected Pixel.
test.each([
    [32, 0, 32],
    [68, 48, 80],
    [100, 80, 112],
])(
    "initializes a %i-byte block with its array at %i using %i bytes",
    (blockSize, offset, allocationSize) => {
        const gl = {
            FLOAT: 0x1406,
            createBuffer: vi.fn(() => ({})),
            bindBuffer: vi.fn(),
            uniformBlockBinding: vi.fn(),
        };
        const programInfo = {
            program: {},
            uniformBlockSpec: {
                blockSpecs: {
                    Mark: { index: 0, size: blockSize, uniformIndices: [0] },
                },
                uniformData: [
                    { name: "uDomain_y[0]", type: gl.FLOAT, size: 2, offset },
                ],
            },
        };

        const info = createUniformBlockInfo(
            /** @type {any} */ (gl),
            /** @type {any} */ (programInfo),
            "Mark"
        );
        info.setters.uDomain_y([3, 7]);

        expect(info.array.byteLength).toBe(allocationSize);
        expect(info.asFloat[offset / 4]).toBe(3);
        expect(info.asFloat[offset / 4 + 4]).toBe(7);
        expect(programInfo.uniformBlockSpec.blockSpecs.Mark.size).toBe(
            blockSize
        );
    }
);
