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

    it("exposes command semantics and invokes focused items", () => {
        const opener = document.createElement("button");
        opener.textContent = "Actions";
        document.body.append(opener);
        const callback = vi.fn();

        dropdownMenu(
            {
                mode: "command",
                items: [
                    { label: "Unavailable" },
                    { type: "divider" },
                    { label: "Run", callback },
                ],
            },
            opener
        );

        const menu = document.querySelector("[role='menu']");
        expect(menu?.getAttribute("aria-label")).toBe("Actions");
        expect(opener.getAttribute("aria-expanded")).toBe("true");
        expect(document.activeElement?.textContent?.trim()).toBe("Unavailable");
        expect(menu?.querySelector("[role='separator']")).toBeTruthy();
        expect(menu?.querySelector("[aria-disabled='true']")).toBeTruthy();

        document.activeElement.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
        );
        expect(callback).not.toHaveBeenCalled();

        document.activeElement.dispatchEvent(
            new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
        );
        expect(document.activeElement?.textContent?.trim()).toBe("Run");
        document.activeElement.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
        );
        expect(callback).toHaveBeenCalledOnce();
        expect(document.activeElement).toBe(opener);
        expect(opener.getAttribute("aria-expanded")).toBe("false");
    });

    it("opens submenus with arrows and restores parent focus with Escape", () => {
        const opener = document.createElement("button");
        document.body.append(opener);
        dropdownMenu(
            {
                mode: "command",
                items: [
                    {
                        label: "More",
                        submenu: [{ label: "Do it", callback: vi.fn() }],
                    },
                ],
            },
            opener
        );

        const trigger = /** @type {HTMLElement} */ (document.activeElement);
        trigger.dispatchEvent(
            new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
        );
        expect(trigger.getAttribute("aria-expanded")).toBe("true");
        expect(document.querySelectorAll("[role='menu']")).toHaveLength(2);
        expect(document.activeElement?.textContent?.trim()).toBe("Do it");

        document.activeElement.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        );
        expect(document.activeElement).toBe(trigger);
        expect(trigger.getAttribute("aria-expanded")).toBe("false");
        expect(document.querySelectorAll("[role='menu']")).toHaveLength(1);
    });

    it("moves focus outside on Tab and Shift+Tab", () => {
        const before = document.createElement("button");
        const opener = document.createElement("button");
        const after = document.createElement("button");
        document.body.append(before, opener, after);

        for (const [key, target] of [
            [false, after],
            [true, before],
        ]) {
            dropdownMenu(
                {
                    mode: "command",
                    items: [{ label: "Run", callback: vi.fn() }],
                },
                opener
            );
            document.activeElement.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "Tab",
                    shiftKey: key,
                    bubbles: true,
                })
            );
            expect(document.activeElement).toBe(target);
            expect(document.querySelector("[role='menu']")).toBeNull();
        }
    });

    it("does not restore an asynchronously loaded submenu after dismissal", async () => {
        /** @type {(items: any[]) => void} */
        let resolveItems;
        const opener = document.createElement("button");
        document.body.append(opener);
        dropdownMenu(
            {
                mode: "command",
                items: [
                    {
                        label: "Async",
                        submenu: () =>
                            new Promise((resolve) => {
                                resolveItems = resolve;
                            }),
                    },
                ],
            },
            opener
        );
        document.activeElement.dispatchEvent(
            new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
        );
        expect(document.activeElement?.textContent?.trim()).toBe("Loading...");
        document.activeElement.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        );
        resolveItems([{ label: "Loaded", callback: vi.fn() }]);
        await Promise.resolve();
        expect(document.querySelectorAll("[role='menu']")).toHaveLength(1);
        expect(document.body.textContent).not.toContain("Loaded");
    });
});
