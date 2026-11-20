// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import "./define/tabs.js";

afterEach(() => {
    document.body.replaceChildren();
});

test("tabs label their panels and preserve entered values when switching", async () => {
    const tabs = createTabs();
    const field = document.createElement("input");
    field.slot = "json";
    tabs.append(field);
    document.body.append(tabs);
    await tabs.updateComplete;

    const [url, json] = tabButtons(tabs);
    const urlPanel = tabs.shadowRoot.getElementById(
        url.getAttribute("aria-controls")
    );
    const jsonPanel = tabs.shadowRoot.getElementById(
        json.getAttribute("aria-controls")
    );
    expect(urlPanel.getAttribute("aria-labelledby")).toBe(url.id);
    expect(jsonPanel.getAttribute("aria-labelledby")).toBe(json.id);
    expect(tabs.value).toBe("url");
    expect(jsonPanel.hidden).toBe(true);

    json.click();
    await tabs.updateComplete;
    field.value = "Edited JSON";
    expect(urlPanel.hidden).toBe(true);
    expect(jsonPanel.hidden).toBe(false);
    expect(json.tabIndex).toBe(0);
    expect(url.tabIndex).toBe(-1);

    url.click();
    await tabs.updateComplete;
    json.click();
    await tabs.updateComplete;
    expect(tabs.shadowRoot.getElementById(jsonPanel.id)).toBe(jsonPanel);
    expect(jsonPanel.querySelector("slot").assignedElements()).toEqual([field]);
    expect(field.value).toBe("Edited JSON");
});

test("keyboard navigation follows focus, wraps, and reports the selected tab", async () => {
    const tabs = createTabs();
    const host = document.createElement("div");
    host.attachShadow({ mode: "open" }).append(tabs);
    document.body.append(host);
    await tabs.updateComplete;
    const listener = vi.fn();
    host.addEventListener("gs-tab-change", listener);

    const [url, json] = tabButtons(tabs);
    url.focus();
    const navigation = /** @type {const} */ ([
        ["ArrowLeft", json, "json"],
        ["Home", url, "url"],
        ["End", json, "json"],
        ["ArrowRight", url, "url"],
    ]);
    for (const [key, tab, value] of navigation) {
        tabs.shadowRoot.activeElement.dispatchEvent(
            new KeyboardEvent("keydown", {
                key,
                bubbles: true,
                cancelable: true,
            })
        );
        await tabs.updateComplete;
        expect(tabs.shadowRoot.activeElement).toBe(tab);
        expect(tab.getAttribute("aria-selected")).toBe("true");
        expect(listener).toHaveBeenLastCalledWith(
            expect.objectContaining({ value })
        );
    }

    tabs.value = "json";
    await tabs.updateComplete;
    expect(json.getAttribute("aria-selected")).toBe("true");
    expect(listener).toHaveBeenCalledTimes(4);
});

function createTabs() {
    const element = /** @type {import("./tabs.js").default} */ (
        document.createElement("gs-tabs")
    );
    element.label = "Export formats";
    element.tabs = [
        { value: "url", label: "URL" },
        { value: "json", label: "JSON" },
    ];
    return element;
}

/** @param {import("./tabs.js").default} tabs */
function tabButtons(tabs) {
    return tabs.shadowRoot.querySelectorAll("button");
}
