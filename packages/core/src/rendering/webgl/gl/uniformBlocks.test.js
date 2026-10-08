import { afterEach, expect, test, vi } from "vitest";
import { createUniformBlockInfoWithDiagnostics } from "./uniformBlocks.js";

afterEach(() => vi.restoreAllMocks());

/**
 * @param {number} blockSize
 * @param {number} [offset]
 */
function fixture(blockSize, offset = 0) {
    const declaration =
        "layout(std140) uniform Mark { mediump float uDomain_y[2]; };";
    const gl = {
        FLOAT: 0x1406,
        UNIFORM_ARRAY_STRIDE: 0x8a3c,
        UNIFORM_MATRIX_STRIDE: 0x8a3d,
        UNIFORM_IS_ROW_MAJOR: 0x8a3e,
        createBuffer: vi.fn(() => ({})),
        bindBuffer: vi.fn(),
        uniformBlockBinding: vi.fn(),
        getActiveUniforms: vi.fn((_program, _indices, property) => [
            property === 0x8a3c ? 16 : 0,
        ]),
        getAttachedShaders: vi.fn(() => [{}, {}]),
        getShaderSource: vi.fn(
            () => declaration + "\nvoid main() { /* shader body */ }"
        ),
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
    const create = () =>
        createUniformBlockInfoWithDiagnostics(
            /** @type {any} */ (gl),
            /** @type {any} */ (programInfo),
            "Mark",
            { view: "root/points", mark: "point" }
        );

    return { gl, create, declaration, programInfo };
}

// Include the point and text block layouts reported by the affected Pixel.
test.each([
    [32, 0, 32],
    [68, 48, 80],
    [100, 80, 112],
])(
    "initializes a %i-byte block with its array at %i using %i bytes",
    (blockSize, offset, allocationSize) => {
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        const { gl, create, programInfo } = fixture(blockSize, offset);
        const info = create();
        info.setters.uDomain_y([3, 7]);

        expect(info.array.byteLength).toBe(allocationSize);
        expect(info.asFloat[offset / 4]).toBe(3);
        expect(info.asFloat[offset / 4 + 4]).toBe(7);
        expect(programInfo.uniformBlockSpec.blockSpecs.Mark.size).toBe(
            blockSize
        );
        expect(log).not.toHaveBeenCalled();
        expect(gl.getActiveUniforms).not.toHaveBeenCalled();
        expect(gl.getAttachedShaders).not.toHaveBeenCalled();
    }
);

test("reports an overflowing TWGL array view and only uniform-block source", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    // This mismatch exceeds trailing padding and must still fail in real TWGL.
    const { create, declaration } = fixture(16);

    expect(create).toThrow(RangeError);
    expect(log).toHaveBeenCalledOnce();
    const report = JSON.parse(log.mock.calls[0][1]);
    expect(report).toMatchObject({
        view: "root/points",
        mark: "point",
        block: "Mark",
        blockSize: 16,
        uniforms: [
            {
                name: "uDomain_y[0]",
                type: "FLOAT",
                count: 2,
                offset: 0,
                arrayStride: 16,
                twglByteLength: 32,
                twglEndOffset: 32,
                exceedsBlock: true,
            },
        ],
        declarations: [declaration],
    });
    expect(log.mock.calls[0][1]).not.toContain("shader body");
    expect(log.mock.calls[0][2]).toBeInstanceOf(RangeError);
});

test("a diagnostics failure does not replace the initialization error", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { gl, create } = fixture(16);
    gl.getActiveUniforms.mockImplementation(() => {
        throw new Error("reflection failed");
    });

    expect(create).toThrow(RangeError);
});
