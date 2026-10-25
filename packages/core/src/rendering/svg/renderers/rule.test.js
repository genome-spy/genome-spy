// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import { createHeadlessEngine } from "../../../genomeSpy/headlessBootstrap.js";
import { createSvg } from "../index.js";

describe("SVG rule renderer", () => {
    test("keeps outlined rules in datum order with isolated opacity and live properties", async () => {
        const { view } = await createHeadlessEngine({
            params: [
                { name: "border", value: 2 },
                { name: "ink", value: "white" },
            ],
            data: { values: [{ width: 4 }, { width: 10 }] },
            mark: {
                type: "rule",
                outlineWidth: { expr: "border" },
                outlineColor: { expr: "ink" },
                opacity: 0.5,
                strokeCap: "round",
            },
            encoding: {
                color: { value: "gray" },
                x: { value: 0.1 },
                x2: { value: 0.9 },
                y: { value: 0.5 },
                size: { field: "width", type: "quantitative", scale: null },
            },
        });
        const render = () =>
            createSvg({ viewRoot: view, logicalWidth: 100, logicalHeight: 100 })
                .svg;
        const pairs = render().querySelector(
            '[data-mark-type="rule"]'
        ).children;
        expect(pairs).toHaveLength(2);
        expect(
            Array.from(pairs, (pair) => [
                pair.getAttribute("opacity"),
                ...Array.from(pair.children, (line) =>
                    line.getAttribute("stroke-width")
                ),
            ])
        ).toEqual([
            ["0.5", "8", "4"],
            ["0.5", "14", "10"],
        ]);
        expect(pairs[0].firstElementChild.getAttribute("stroke")).toBe("white");
        expect(pairs[0].getAttribute("stroke-opacity")).toBe("1");

        view.paramRuntime.setValue("ink", "red");
        expect(render().querySelector("line").getAttribute("stroke")).toBe(
            "red"
        );
        view.paramRuntime.setValue("border", 0);
        expect(
            render().querySelectorAll('[data-mark-type="rule"] line')
        ).toHaveLength(2);
        expect(
            render().querySelector('[data-mark-type="rule"]').firstElementChild
                .tagName
        ).toBe("line");
    });

    test("retains an offscreen rule when only its outline enters the viewport", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: {
                type: "rule",
                size: 2,
                opacity: 1,
                outlineWidth: 5,
                clip: false,
            },
            encoding: {
                color: { value: "gray" },
                x: { value: 0.1 },
                x2: { value: 0.9 },
                y: { value: 1.04 },
            },
        });
        const render = () =>
            createSvg({ viewRoot: view, logicalWidth: 100, logicalHeight: 100 })
                .svg;
        expect(
            render().querySelectorAll('[data-mark-type="rule"] line')
        ).toHaveLength(2);
    });

    test("expands short rules to their expression-valued minimum length", async () => {
        const { view } = await createHeadlessEngine({
            params: [{ name: "minimum", value: 10 }],
            data: { values: [{}] },
            mark: {
                type: "rule",
                minLength: { expr: "minimum" },
                strokeCap: "square",
            },
            encoding: {
                x: { value: 0.49 },
                x2: { value: 0.51 },
                y: { value: 0.5 },
                y2: { value: 0.5 },
                color: { value: "black" },
                size: { value: 2 },
            },
        });

        const { svg } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });
        const line = svg.querySelector('[data-mark-type="rule"] line');

        expect(line?.getAttribute("x1")).toBe("45");
        expect(line?.getAttribute("x2")).toBe("55");
        expect(line?.getAttribute("y1")).toBe("50");
        expect(line?.getAttribute("y2")).toBe("50");
    });
});
