import { describe, expect, test } from "vitest";
import Rectangle from "../../../view/layout/rectangle.js";
import { visitPointInstances } from "./point.js";
import { visitRectInstances } from "./rect.js";

/** @param {(datum: any) => any} read @param {boolean} [constant] */
function encoder(read, constant = false) {
    return Object.assign(read, {
        branches: [],
        channelDef: {},
        constant,
    });
}

const zero = encoder(() => 0, true);
const one = encoder(() => 1, true);

function bounds() {
    return { x1: -Infinity, y1: -Infinity, x2: Infinity, y2: Infinity };
}

describe("indexed immediate ranges", () => {
    test("point traversal visits only the requested source rows", () => {
        const data = [{ x: 0.1 }, { x: 0.5 }, { x: 0.9 }];
        const mark = /** @type {any} */ ({
            encoders: {
                angle: zero,
                dx: zero,
                dy: zero,
                semanticScore: zero,
                shape: encoder(() => "circle", true),
                size: encoder(() => 4, true),
                strokeWidth: zero,
                x: encoder((datum) => datum.x),
                xOffset: zero,
                y: encoder(() => 0.5, true),
                yOffset: zero,
            },
            getSemanticThreshold: () => -1,
        });
        /** @type {object[]} */
        const visited = [];

        visitPointInstances(
            mark,
            { inwardStroke: false },
            {
                coords: Rectangle.create(0, 0, 100, 100),
                data,
                visibleBounds: bounds(),
                anchorCullBounds: bounds(),
                start: 1,
                end: 2,
            },
            (instance) => visited.push(instance.datum)
        );

        expect(visited).toEqual([data[1]]);
    });

    test("rectangle traversal visits only the requested source rows", () => {
        const data = [
            { x: 0.1, x2: 0.2 },
            { x: 0.5, x2: 0.6 },
            { x: 0.8, x2: 0.9 },
        ];
        const mark = /** @type {any} */ ({
            encoders: {
                fill: encoder(() => "black", true),
                fillOpacity: one,
                strokeWidth: zero,
                x: encoder((datum) => datum.x),
                x2: encoder((datum) => datum.x2),
                xOffset: zero,
                y: encoder(() => 0.2, true),
                y2: encoder(() => 0.8, true),
                yOffset: zero,
            },
        });
        /** @type {object[]} */
        const visited = [];

        visitRectInstances(
            mark,
            {
                cornerRadii: {
                    topLeft: 0,
                    topRight: 0,
                    bottomRight: 0,
                    bottomLeft: 0,
                },
                minWidth: 0,
                minHeight: 0,
                minOpacity: 0,
                shadow: {
                    blur: 0,
                    color: "black",
                    offsetX: 0,
                    offsetY: 0,
                    opacity: 0,
                },
                hatch: "none",
                hasCornerRadii: false,
                canPadSeams: false,
            },
            {
                coords: Rectangle.create(0, 0, 100, 100),
                data,
                visibleBounds: bounds(),
                viewOpacity: 1,
                start: 1,
                end: 2,
            },
            (instance) => visited.push(instance.datum)
        );

        expect(visited).toEqual([data[1]]);
    });
});
