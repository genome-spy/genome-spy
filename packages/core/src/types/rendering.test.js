import { describe, expect, test } from "vitest";

import Rectangle from "../view/layout/rectangle.js";
import { normalizeClipOptions } from "./rendering.js";

describe("rendering clip options", () => {
    test("normalizes legacy clipRect to both-direction clipping", () => {
        const rect = Rectangle.create(1, 2, 3, 4);

        expect(normalizeClipOptions({ clipRect: rect })).toEqual({
            rect,
            clipX: true,
            clipY: true,
        });
    });
});
