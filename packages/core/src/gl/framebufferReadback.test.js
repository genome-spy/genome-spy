// @vitest-environment jsdom

import { describe, expect, test, vi } from "vitest";

import {
    framebufferToBlob,
    flipRgbaPixels,
    readFramebufferPixels,
} from "./framebufferReadback.js";

describe("flipRgbaPixels", () => {
    test("flips WebGL rows into top-left-origin order", () => {
        const bottom = [1, 2, 3, 255, 4, 5, 6, 255];
        const top = [7, 8, 9, 255, 10, 11, 12, 255];

        expect(
            Array.from(
                flipRgbaPixels(new Uint8Array([...bottom, ...top]), 2, 2, false)
            )
        ).toEqual([...top, ...bottom]);
    });

    test("unpremultiplies translucent colors and clears transparent RGB", () => {
        const pixels = flipRgbaPixels(
            new Uint8Array([32, 64, 128, 128, 12, 34, 56, 0]),
            2,
            1,
            true
        );

        expect(Array.from(pixels)).toEqual([64, 128, 255, 128, 0, 0, 0, 0]);
    });
});

describe("readFramebufferPixels", () => {
    test("converts top-left crop bounds for WebGL readPixels", () => {
        const gl = {
            FRAMEBUFFER: 1,
            RGBA: 2,
            UNSIGNED_BYTE: 3,
            bindFramebuffer: vi.fn(),
            readPixels: vi.fn(),
        };
        const framebuffer = {};
        const framebufferInfo = {
            framebuffer,
            width: 20,
            height: 12,
        };

        readFramebufferPixels(
            /** @type {any} */ (gl),
            /** @type {any} */ (framebufferInfo),
            { x: 3, y: 2, width: 5, height: 4 }
        );

        expect(gl.readPixels).toHaveBeenCalledWith(
            3,
            6,
            5,
            4,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            expect.any(Uint8Array)
        );
        expect(gl.bindFramebuffer.mock.calls).toEqual([
            [gl.FRAMEBUFFER, framebuffer],
            [gl.FRAMEBUFFER, null],
        ]);
    });

    test("rejects invalid crop bounds", () => {
        const framebufferInfo = { width: 10, height: 10 };
        const gl = /** @type {any} */ ({});

        expect(() =>
            readFramebufferPixels(gl, /** @type {any} */ (framebufferInfo), {
                x: 8,
                y: 0,
                width: 3,
                height: 1,
            })
        ).toThrow("out of range");
    });
});

describe("framebufferToBlob", () => {
    test("encodes readback pixels using the requested MIME type", async () => {
        const blob = new Blob(["png"], { type: "image/png" });
        const canvas = {
            width: 0,
            height: 0,
            getContext: vi.fn(() => ({
                createImageData: vi.fn(() => ({
                    data: new Uint8ClampedArray(4),
                })),
                putImageData: vi.fn(),
            })),
            toBlob: vi.fn((callback, type) => callback(blob, type)),
        };
        const createElement = vi
            .spyOn(document, "createElement")
            .mockReturnValue(/** @type {any} */ (canvas));
        const gl = {
            FRAMEBUFFER: 1,
            RGBA: 2,
            UNSIGNED_BYTE: 3,
            bindFramebuffer: vi.fn(),
            readPixels: vi.fn(),
        };

        await expect(
            framebufferToBlob(
                /** @type {any} */ (gl),
                /** @type {any} */ ({
                    framebuffer: {},
                    width: 1,
                    height: 1,
                }),
                "image/png"
            )
        ).resolves.toBe(blob);
        expect(canvas.toBlob).toHaveBeenCalledWith(
            expect.any(Function),
            "image/png"
        );

        createElement.mockRestore();
    });
});
