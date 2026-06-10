// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import Tooltip from "./tooltip.js";
import { html } from "lit";

describe("Tooltip async updates", () => {
    it("ignores stale async result after clear", async () => {
        const container = document.createElement("div");
        const tooltip = new Tooltip(container);

        // Non-obvious: set coords so updatePlacement doesn't crash in jsdom.
        tooltip.mouseCoords = [0, 0];

        const setContentSpy = vi.spyOn(tooltip, "setContent");

        /** @type {(value: string) => void} */
        let resolve;
        const promise = new Promise((resolver) => {
            resolve = resolver;
        });

        tooltip.updateWithDatum({ symbol: "A" }, () => promise);
        tooltip.clear();
        setContentSpy.mockClear();

        resolve("A");
        await promise;
        await Promise.resolve();

        expect(setContentSpy).not.toHaveBeenCalledWith("A");
    });

    it("ignores stale async result after datum change", async () => {
        const container = document.createElement("div");
        const tooltip = new Tooltip(container);

        // Non-obvious: set coords so updatePlacement doesn't crash in jsdom.
        tooltip.mouseCoords = [0, 0];

        const setContentSpy = vi.spyOn(tooltip, "setContent");

        /** @type {(value: string) => void} */
        let resolveA;
        const promiseA = new Promise((resolver) => {
            resolveA = resolver;
        });

        /** @type {(value: string) => void} */
        let resolveB;
        const promiseB = new Promise((resolver) => {
            resolveB = resolver;
        });

        tooltip.updateWithDatum({ symbol: "A" }, () => promiseA);
        tooltip.updateWithDatum({ symbol: "B" }, () => promiseB);
        setContentSpy.mockClear();

        resolveA("A");
        resolveB("B");
        await Promise.all([promiseA, promiseB]);
        await Promise.resolve();

        expect(setContentSpy).toHaveBeenCalledWith("B");
        expect(setContentSpy).not.toHaveBeenCalledWith("A");
    });
});

describe("Tooltip popover placement", () => {
    it("uses a manual popover", () => {
        const container = document.createElement("div");
        new Tooltip(container);

        const element = /** @type {HTMLElement} */ (
            container.querySelector(".tooltip")
        );

        expect(element.getAttribute("popover")).toBe("manual");
    });

    it("shows and hides the popover when native methods are available", () => {
        const container = document.createElement("div");
        const tooltip = new Tooltip(container);
        tooltip.mouseCoords = [0, 0];

        const element = /** @type {HTMLElement} */ (
            container.querySelector(".tooltip")
        );
        element.showPopover = vi.fn();
        element.hidePopover = vi.fn();

        tooltip.setContent("Visible");
        tooltip.clear();

        expect(element.showPopover).toHaveBeenCalledTimes(1);
        expect(element.hidePopover).toHaveBeenCalledTimes(1);
    });

    it("positions the tooltip using viewport coordinates", () => {
        const container = document.createElement("div");
        const tooltip = new Tooltip(container);
        const element = /** @type {HTMLElement} */ (
            container.querySelector(".tooltip")
        );

        Object.defineProperty(element, "offsetWidth", { value: 60 });
        Object.defineProperty(element, "offsetHeight", { value: 30 });
        Object.defineProperty(window, "innerWidth", {
            value: 300,
            configurable: true,
        });
        Object.defineProperty(window, "innerHeight", {
            value: 200,
            configurable: true,
        });

        // Avoid handleMouseMove's timing-based tooltip penalty in this
        // placement-only test.
        tooltip.mouseCoords = [250, 190];
        tooltip.setContent("Visible");

        expect(element.style.left).toBe("180px");
        expect(element.style.top).toBe("160px");
    });

    it("identifies events that start inside the tooltip", () => {
        const container = document.createElement("div");
        const tooltip = new Tooltip(container);
        const element = /** @type {HTMLElement} */ (
            container.querySelector(".tooltip")
        );
        const event = new Event("mousedown");
        event.composedPath = () => [element, container, document];

        expect(tooltip.containsEvent(event)).toBe(true);
    });
});

describe("Tooltip autoscroll containers", () => {
    it("scrolls the hovered row into view after content is rendered", async () => {
        const container = document.createElement("div");
        const tooltip = new Tooltip(container);
        tooltip.mouseCoords = [0, 0];

        const scrollIntoView = vi.fn();
        const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
        HTMLElement.prototype.scrollIntoView = scrollIntoView;

        try {
            tooltip.setContent(html`
                <div class="autoscroll-container">
                    <table>
                        <tr>
                            <th>foo</th>
                        </tr>
                        <tr class="hovered">
                            <th>bar</th>
                        </tr>
                    </table>
                </div>
            `);

            await Promise.resolve();

            expect(scrollIntoView).toHaveBeenCalledWith({
                block: "nearest",
                inline: "nearest",
            });
        } finally {
            HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
        }
    });
});
