// @vitest-environment jsdom

import { expect, test } from "vitest";
import { createHeadlessEngine } from "../../genomeSpy/headlessBootstrap.js";
import { createSvg } from "../../rendering/svg/index.js";

test("separators follow grid gaps when the plot resizes", async () => {
    const { view } = await createHeadlessEngine({
        padding: 0,
        columns: 2,
        spacing: 20,
        separator: true,
        concat: Array.from({ length: 4 }, () => ({
            width: { grow: 1 },
            height: { grow: 1 },
            data: { values: [{}] },
            mark: "rule",
            encoding: {
                x: { value: 0.5 },
                x2: { value: 0.5 },
                y: { value: 0.5 },
                y2: { value: 0.5 },
                color: { value: "black" },
            },
        })),
    });

    try {
        for (const [width, height] of [
            [400, 200],
            [600, 300],
        ]) {
            const { svg } = createSvg({
                viewRoot: view,
                logicalWidth: width,
                logicalHeight: height,
            });
            const vertical = svg.querySelector(
                '[data-name^="separatorVertical"] line'
            );
            const horizontal = svg.querySelector(
                '[data-name^="separatorHorizontal"] line'
            );

            expect(
                ["x1", "x2", "y1", "y2"].map((name) =>
                    Number(vertical.getAttribute(name))
                )
            ).toEqual([width / 2, width / 2, height, 0]);
            expect(
                ["x1", "x2", "y1", "y2"].map((name) =>
                    Number(horizontal.getAttribute(name))
                )
            ).toEqual([0, width, height / 2, height / 2]);
        }
    } finally {
        view.disposeSubtree();
    }
});
