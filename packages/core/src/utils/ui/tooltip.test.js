// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import Tooltip from "./tooltip.js";

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
