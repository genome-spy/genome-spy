import { describe, expect, test } from "vitest";

import Rectangle from "../layout/rectangle.js";
import {
    clipOptionsEqual,
    combineClipOptions,
    getViewClipDirections,
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

    test("reports only a unit mark's explicit semantic clip directions", () => {
        const createView = (
            /** @type {boolean | "x" | "y" | "never"} */ clip
        ) => {
            const view = /** @type {any} */ ({
                mark: { properties: { clip } },
            });
            return view;
        };

        expect(getViewClipDirections(createView(true))).toEqual({
            clipX: true,
            clipY: true,
        });
        expect(getViewClipDirections(createView("x"))).toEqual({
            clipX: true,
            clipY: false,
        });
        expect(getViewClipDirections(createView("y"))).toEqual({
            clipX: false,
            clipY: true,
        });
        expect(getViewClipDirections(createView("never"))).toEqual({
            clipX: false,
            clipY: false,
        });
        expect(getViewClipDirections(createView(false))).toEqual({
            clipX: false,
            clipY: false,
        });
        const container = /** @type {any} */ ({
            visit(/** @type {(view: any) => void} */ visitor) {
                visitor(this);
                visitor(createView(true));
                visitor(createView("x"));
            },
        });
        expect(getViewClipDirections(container)).toEqual({
            clipX: true,
            clipY: false,
        });
        expect(
            getViewClipDirections(
                /** @type {any} */ ({
                    visit: (/** @type {(view: any) => void} */ visitor) =>
                        visitor({}),
                })
            )
        ).toEqual({
            clipX: false,
            clipY: false,
        });
    });
});
