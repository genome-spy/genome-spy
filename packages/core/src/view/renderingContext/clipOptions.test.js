import { describe, expect, onTestFinished, test } from "vitest";

import Rectangle from "../layout/rectangle.js";
import LayerView from "../layerView.js";
import { create } from "../testUtils.js";
import {
    clipOptionsEqual,
    combineClipOptions,
    getViewClipFlags,
    normalizeClipOptions,
    prepareMarkClipOptionsFromClip,
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

    test("compares clip options by value", () => {
        expect(
            clipOptionsEqual(
                {
                    rect: Rectangle.create(1, 2, 3, 4),
                    clipX: true,
                    clipY: false,
                },
                {
                    rect: Rectangle.create(1, 2, 3, 4),
                    clipX: true,
                    clipY: false,
                }
            )
        ).toBe(true);

        expect(
            clipOptionsEqual(
                {
                    rect: Rectangle.create(1, 2, 3, 4),
                    clipX: true,
                    clipY: false,
                },
                {
                    rect: Rectangle.create(1, 2, 3, 4),
                    clipX: false,
                    clipY: true,
                }
            )
        ).toBe(false);
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

    test("prepares mark clip from an already-normalized inherited clip", () => {
        const coords = Rectangle.create(2, 2, 6, 6);
        const inheritedClip = {
            rect: Rectangle.create(0, 4, 10, 4),
            clipX: false,
            clipY: true,
        };
        const clip = prepareMarkClipOptionsFromClip(inheritedClip, "x", coords);

        expect(clip).toMatchObject({
            clipX: true,
            clipY: true,
        });
        expect(clip?.rect.equals(Rectangle.create(2, 4, 6, 4))).toBeTruthy();
    });

    test.each(
        /** @type {[import("../../spec/mark.js").MarkProps["clip"][], boolean[]][]} */ ([
            [[true], [true, true, true, true]],
            [["x"], [true, false, false, true]],
            [["y"], [false, true, false, true]],
            [["never"], [false, false, false, false]],
            [[false], [false, false, false, false]],
            [[undefined], [false, false, false, false]],
            [
                [true, "x"],
                [true, false, false, true],
            ],
            [
                ["x", "y"],
                [false, false, false, true],
            ],
            [
                [true, "never"],
                [false, false, false, true],
            ],
            [[], [false, false, true, false]],
        ])
    )(
        "summarizes clipping for marks %j",
        async (clips, [clipX, clipY, all, any]) => {
            const view = await create(
                {
                    layer: clips.map((clip) => ({
                        mark: { type: "point", clip },
                    })),
                },
                LayerView
            );
            onTestFinished(() => view.disposeSubtree());
            expect(getViewClipFlags(view)).toEqual({ clipX, clipY, all, any });
        }
    );
});
