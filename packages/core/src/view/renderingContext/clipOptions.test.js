import { describe, expect, test } from "vitest";

import Rectangle from "../layout/rectangle.js";
import {
    combineClipOptions,
    normalizeClipOptions,
    prepareMarkClipOptions,
} from "./clipOptions.js";

describe("rendering clip options", () => {
    test("normalizes legacy clipRect to both-direction clipping", () => {
        const rect = Rectangle.create(1, 2, 3, 4);

        expect(normalizeClipOptions({ clipRect: rect })).toEqual({
            rect,
            clipX: true,
            clipY: true,
        });
    });

    test("combines overlapping same-direction clips by intersecting ranges", () => {
        const current = {
            rect: Rectangle.create(0, 0, 10, 10),
            clipX: true,
            clipY: false,
        };
        const next = {
            rect: Rectangle.create(5, 5, 10, 10),
            clipX: true,
            clipY: true,
        };
        const combined = combineClipOptions(current, next);

        expect(combined).toMatchObject({
            clipX: true,
            clipY: true,
        });
        expect(
            combined?.rect.equals(Rectangle.create(5, 5, 5, 10))
        ).toBeTruthy();
    });

    test("prepares mark clip by combining inherited and self clipping", () => {
        const coords = Rectangle.create(2, 2, 6, 6);
        const clipRect = Rectangle.create(0, 4, 10, 4);
        const clip = prepareMarkClipOptions(
            { clip: { rect: clipRect, clipX: false, clipY: true } },
            "x",
            coords
        );

        expect(clip).toMatchObject({
            clipX: true,
            clipY: true,
        });
        expect(clip?.rect.equals(Rectangle.create(2, 4, 6, 4))).toBeTruthy();
    });
});
