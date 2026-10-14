// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { html } from "lit";

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

    it("dismisses the menu on a right-click inside it", () => {
        const opener = document.createElement("button");
        document.body.append(opener);
        dropdownMenu(
            { mode: "command", items: [{ label: "Run", callback: vi.fn() }] },
            opener
        );

        const event = new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
        });
        document.querySelector("[role='menuitem']").dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(document.querySelector("[role='menu']")).toBeNull();
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
                        shortcut: "M",
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
        expect(
            document
                .querySelectorAll("[role='menu']")[1]
                .getAttribute("aria-label")
        ).toBe("More");
        expect(document.activeElement?.textContent?.trim()).toBe("Do it");

        document.activeElement.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        );
        expect(document.activeElement).toBe(trigger);
        expect(trigger.getAttribute("aria-expanded")).toBe("false");
        expect(document.querySelectorAll("[role='menu']")).toHaveLength(1);
    });

    it("moves focus outside on Tab and Shift+Tab, wrapping at the ends", () => {
        const before = document.createElement("button");
        const opener = document.createElement("button");
        const hidden = document.createElement("div");
        hidden.style.display = "none";
        hidden.append(document.createElement("button"));
        const after = document.createElement("button");
        document.body.append(before, opener, hidden, after);

        for (const [trigger, shiftKey, target] of [
            [opener, false, after],
            [opener, true, before],
            [after, false, before],
            [before, true, after],
        ]) {
            dropdownMenu(
                {
                    mode: "command",
                    items: [{ label: "Run", callback: vi.fn() }],
                },
                trigger
            );
            document.activeElement.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "Tab",
                    shiftKey,
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

    it("keeps visibility inputs separate from named settings buttons", () => {
        const opener = document.createElement("button");
        document.body.append(opener);
        dropdownMenu(
            {
                mode: "controls",
                label: "View settings",
                items: [
                    {
                        key: "track",
                        label: "Track",
                        customContent: html`<label
                            ><input
                                type="checkbox"
                                data-control-key="track:visibility"
                                checked
                            />Track</label
                        >`,
                        submenu: [
                            {
                                customContent: html`<label
                                    >Size <input type="range"
                                /></label>`,
                            },
                        ],
                    },
                ],
            },
            opener
        );

        const root = document.querySelector("[role='dialog']");
        const checkbox = /** @type {HTMLInputElement} */ (
            root?.querySelector("input[type='checkbox']")
        );
        const settings = /** @type {HTMLButtonElement} */ (
            root?.querySelector("button[aria-haspopup='dialog']")
        );
        expect(root?.getAttribute("aria-label")).toBe("View settings");
        expect(root?.querySelector("[role='menuitem']")).toBeNull();
        expect(checkbox.checked).toBe(true);
        expect(settings.getAttribute("aria-label")).toBe("Settings for Track");
        expect(document.activeElement).toBe(checkbox);

        settings.click();
        expect(settings.getAttribute("aria-expanded")).toBe("true");
        expect(document.querySelectorAll("[role='dialog']")).toHaveLength(2);
        expect(document.activeElement?.tagName).toBe("INPUT");
        document.activeElement.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        );
        expect(document.activeElement).toBe(settings);
        expect(settings.getAttribute("aria-expanded")).toBe("false");

        document.activeElement.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        );
        expect(document.activeElement).toBe(opener);
        expect(document.querySelector("[role='dialog']")).toBeNull();
    });

    it("exits the controls popup on Shift+Tab from its first control", () => {
        const before = document.createElement("button");
        const opener = document.createElement("button");
        document.body.append(before, opener);

        dropdownMenu(
            {
                mode: "controls",
                items: [
                    {
                        customContent: html`<label
                            ><input type="checkbox" />Track</label
                        >`,
                    },
                ],
            },
            opener
        );
        expect(document.activeElement?.tagName).toBe("INPUT");
        document.activeElement.dispatchEvent(
            new KeyboardEvent("keydown", {
                key: "Tab",
                shiftKey: true,
                bubbles: true,
            })
        );
        expect(document.activeElement).toBe(before);
        expect(document.querySelector("[role='dialog']")).toBeNull();
    });

    it("exits after the selected radio even when later options share its group", () => {
        const opener = document.createElement("button");
        const after = document.createElement("button");
        document.body.append(opener, after);

        dropdownMenu(
            {
                mode: "controls",
                items: [
                    {
                        customContent: html`<label
                                ><input
                                    type="radio"
                                    name="mode"
                                    checked
                                />A</label
                            ><label
                                ><input type="radio" name="mode" />B</label
                            >`,
                    },
                ],
            },
            opener
        );
        expect(document.activeElement).toBe(
            document.querySelector("input:checked")
        );
        document.activeElement.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Tab", bubbles: true })
        );
        expect(document.activeElement).toBe(after);
        expect(document.querySelector("[role='dialog']")).toBeNull();
    });

    it("restores focus to an equivalent control after a popup update", () => {
        const opener = document.createElement("button");
        document.body.append(opener);
        const items = (/** @type {boolean} */ checked) => [
            {
                key: "track",
                label: "Track",
                customContent: html`<label
                    ><input
                        type="checkbox"
                        data-control-key="track:visibility"
                        .checked=${checked}
                    />Track</label
                >`,
            },
        ];
        dropdownMenu(
            { mode: "controls", label: "View settings", items: items(false) },
            opener
        );
        dropdownMenu(
            { mode: "controls", label: "View settings", items: items(true) },
            opener
        );
        const checkbox = /** @type {HTMLInputElement} */ (
            document.querySelector("[data-control-key='track:visibility']")
        );
        expect(document.activeElement).toBe(checkbox);
        expect(checkbox.checked).toBe(true);
        expect(document.querySelectorAll("[role='dialog']")).toHaveLength(1);
    });

    it("keeps bookmark overflow actions in a keyboard-reachable submenu", () => {
        const opener = document.createElement("button");
        document.body.append(opener);
        dropdownMenu(
            {
                mode: "command",
                label: "Bookmarks",
                items: [
                    { label: "Local bookmarks", type: "header" },
                    {
                        label: "Saved view",
                        callback: vi.fn(),
                        ellipsisSubmenu: [
                            { label: "Delete", callback: vi.fn() },
                        ],
                    },
                ],
            },
            opener
        );

        const overflow = /** @type {HTMLElement} */ (
            document.querySelector("[aria-label='Actions for Saved view']")
        );
        expect(document.querySelectorAll("[role='separator']")).toHaveLength(1);
        document.activeElement.dispatchEvent(
            new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
        );
        expect(document.activeElement).toBe(overflow);
        overflow.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
        );
        expect(overflow.getAttribute("aria-expanded")).toBe("true");
        expect(
            document
                .querySelectorAll("[role='menu']")[1]
                .getAttribute("aria-label")
        ).toBe("Actions for Saved view");
        expect(document.activeElement?.textContent?.trim()).toBe("Delete");
        document.activeElement.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        );
        expect(document.activeElement).toBe(overflow);
        expect(overflow.getAttribute("aria-expanded")).toBe("false");
    });

    it("uses live command text as its accessible name after updates", () => {
        const opener = document.createElement("button");
        document.body.append(opener);
        dropdownMenu(
            {
                mode: "command",
                items: [
                    {
                        label: html`Sort by <em>Sample</em>, ascending`,
                        shortcut: "S",
                        callback: vi.fn(),
                    },
                ],
            },
            opener
        );

        const item = /** @type {HTMLElement} */ (document.activeElement);
        expect(item.getAttribute("aria-label")).toBeNull();
        expect(
            item.firstElementChild?.textContent?.replace(/\s+/g, " ").trim()
        ).toBe("Sort by Sample, ascending");
        expect(
            item.querySelector(".kbd-shortcut")?.getAttribute("aria-hidden")
        ).toBe("true");

        dropdownMenu(
            {
                mode: "command",
                items: [
                    {
                        label: html`Sort by <em>Tumor</em>, descending`,
                        callback: vi.fn(),
                    },
                ],
            },
            opener
        );
        expect(document.activeElement?.getAttribute("aria-label")).toBeNull();
        expect(document.activeElement?.textContent?.trim()).toBe(
            "Sort by Tumor, descending"
        );
    });
});
