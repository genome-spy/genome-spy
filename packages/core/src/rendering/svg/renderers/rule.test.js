// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import { createHeadlessEngine } from "../../../genomeSpy/headlessBootstrap.js";
import { createSvg } from "../index.js";

describe("SVG rule renderer", () => {
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
