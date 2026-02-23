// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { createViewHighlighter } from "./viewHighlight.js";

describe("viewHighlight", () => {
    test("removes stale highlight when the target view is not effectively visible", () => {
        const container = document.createElement("div");
        const highlightView = createViewHighlighter(container);

        const visibleView = /** @type {import("../view/view.js").default} */ (
            /** @type {unknown} */ ({
                isVisible: () => true,
                coords: {
                    x: 10,
                    y: 20,
                    width: 30,
                    height: 40,
                },
            })
        );

        const hiddenView = /** @type {import("../view/view.js").default} */ (
            /** @type {unknown} */ ({
                isVisible: () => false,
                coords: {
                    x: 1,
                    y: 2,
                    width: 3,
                    height: 4,
                },
            })
        );

        highlightView(visibleView);
        expect(container.querySelector(".view-highlight")).toBeTruthy();

        highlightView(hiddenView);
        expect(container.querySelector(".view-highlight")).toBeNull();
    });
});
