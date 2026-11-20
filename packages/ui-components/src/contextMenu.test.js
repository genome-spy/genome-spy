// @vitest-environment jsdom

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createMenuController } from "./contextMenu.js";

const cleanup = vi.fn();
/** @type {ReturnType<typeof createMenuController>} */
let menu;
/** @type {HTMLButtonElement} */
let trigger;

beforeEach(() => {
    cleanup.mockClear();
    menu = createMenuController({ onOpen: () => cleanup });
    trigger = document.createElement("button");
    trigger.textContent = "Menu";
    document.body.append(trigger);
});

afterEach(() => {
    menu.dismissDropdownMenu();
    document.body.replaceChildren();
});

test.each([
    [
        "command",
        { type: "group", label: "Renderer" },
        "requires a text label and an items array",
    ],
    ["controls", { type: "link", href: "/docs/" }, "requires command mode"],
])("cleans up an invalid %s menu", (mode, item, message) => {
    expect(() => menu.dropdownMenu({ mode, items: [item] }, trigger)).toThrow(
        message
    );
    expect(menu.isContextMenuOpen()).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector(".gs-context-menu-backdrop")).toBeNull();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(trigger);
});

test("keeps focus on a command when its label and checked state change", () => {
    const checkbox = (label, checked) => ({
        type: "checkbox",
        key: "inspector",
        label,
        checked,
        callback: vi.fn(),
    });
    const other = { label: "Examples", callback: vi.fn() };

    menu.dropdownMenu(
        { mode: "command", items: [other, checkbox("Inspector", false)] },
        trigger
    );
    document.querySelector('[role="menuitemcheckbox"]').focus();
    menu.dropdownMenu(
        {
            mode: "command",
            items: [other, { label: "Data" }, checkbox("Hide inspector", true)],
        },
        trigger
    );

    const focused = document.activeElement;
    expect(focused.getAttribute("role")).toBe("menuitemcheckbox");
    expect(focused.getAttribute("aria-checked")).toBe("true");
    expect(focused.textContent).toContain("Hide inspector");
});

test("a disabled command disables its secondary action", () => {
    const callback = vi.fn();
    menu.dropdownMenu(
        {
            mode: "command",
            items: [
                {
                    label: "Saved view",
                    disabled: true,
                    callback,
                    ellipsisSubmenu: [{ label: "Delete", callback }],
                },
            ],
        },
        trigger
    );

    const row = document.querySelector('[role="menuitem"]');
    expect(row.getAttribute("aria-disabled")).toBe("true");
    expect(document.querySelector(".menu-ellipsis")).toBeNull();
    row.click();
    expect(callback).not.toHaveBeenCalled();
});

test("disables generated controls and their submenus", () => {
    const callback = vi.fn();
    const submenu = vi.fn(() => [{ label: "Open", callback }]);
    menu.dropdownMenu(
        {
            items: [{ label: "Saved view", submenu, callback, disabled: true }],
        },
        trigger
    );

    const panel = document.querySelector(".gs-controls-popup");
    const rows = Array.from(panel.querySelectorAll("button"));
    expect(rows).toHaveLength(2);
    for (const row of rows) {
        expect(row.disabled).toBe(true);
        row.click();
    }
    expect(document.activeElement).toBe(panel);
    expect(callback).not.toHaveBeenCalled();
    expect(submenu).not.toHaveBeenCalled();
});

test.each([
    [
        "command",
        { type: "group", label: "Invalid group" },
        "Could not open submenu.",
    ],
    ["controls", { type: "link", href: "/docs/" }, "Could not open settings."],
])("shows a fallback for invalid %s submenu content", (mode, item, message) => {
    menu.dropdownMenu(
        { mode, items: [{ label: "Options", submenu: [item] }] },
        trigger
    );

    const parent = document.querySelector(".gs-context-menu button");
    parent.click();
    const submenu = document.getElementById(
        parent.getAttribute("aria-controls")
    );
    expect(submenu.textContent).toContain(message);
    expect(submenu.contains(document.activeElement)).toBe(true);
});

test("cancels a pending submenu when its row becomes disabled", () => {
    vi.useFakeTimers();
    try {
        const submenu = vi.fn(() => [{ label: "Child" }]);
        const row = { label: "Options", submenu };
        menu.dropdownMenu({ mode: "command", items: [row] }, trigger);

        document
            .querySelector('[role="menuitem"]')
            .dispatchEvent(new MouseEvent("mouseenter"));
        menu.dropdownMenu(
            { mode: "command", items: [{ ...row, disabled: true }] },
            trigger
        );
        vi.advanceTimersByTime(150);

        expect(submenu).not.toHaveBeenCalled();
        expect(document.querySelectorAll('[role="menu"]')).toHaveLength(1);
    } finally {
        vi.useRealTimers();
    }
});
