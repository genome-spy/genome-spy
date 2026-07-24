// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

const { computePosition } = vi.hoisted(() => ({
    computePosition: vi.fn(() => Promise.resolve({ x: 0, y: 0 })),
}));

vi.mock("@floating-ui/dom", () => ({
    computePosition,
    flip: () => undefined,
    offset: () => undefined,
}));

import { dropdownMenu } from "./contextMenu.js";

describe("dropdownMenu", () => {
    afterEach(() => {
        document.querySelector(".gs-context-menu-backdrop")?.click();
        document.body.replaceChildren();
        vi.clearAllMocks();
    });

    it("positions fixed menus in viewport coordinates", () => {
        const opener = document.createElement("button");
        document.body.append(opener);

        dropdownMenu({ items: [{ label: "Menu item" }] }, opener);

        const menu = computePosition.mock.calls[0][1];
        expect(menu.style.top).toBe("0px");
        expect(computePosition.mock.calls[0][2]).toMatchObject({
            strategy: "fixed",
        });
    });
});
