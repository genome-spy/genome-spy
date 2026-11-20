// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import "./define/segmentedControl.js";

afterEach(() => {
    document.body.replaceChildren();
});

test("selection stays local to each group and only user changes emit an event", async () => {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    const first = createControl("First", "side-by-side");
    const second = createControl("Second", "stacked");
    root.append(first, second);
    document.body.append(host);
    await Promise.all([first.updateComplete, second.updateComplete]);

    const listener = vi.fn();
    host.addEventListener("change", listener);

    first.value = "stacked";
    await first.updateComplete;
    expect(first.shadowRoot.querySelector("input:checked").value).toBe(
        "stacked"
    );
    expect(listener).not.toHaveBeenCalled();

    first.shadowRoot.querySelector('input[value="side-by-side"]').click();
    expect(first.value).toBe("side-by-side");
    expect(second.shadowRoot.querySelector("input:checked").value).toBe(
        "stacked"
    );
    expect(listener).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ value: "side-by-side" })
    );
});

/**
 * @param {string} label
 * @param {string} value
 */
function createControl(label, value) {
    const control = /** @type {import("./segmentedControl.js").default} */ (
        document.createElement("gs-segmented-control")
    );
    control.label = label;
    control.options = [
        { value: "side-by-side", label: "Side by side" },
        { value: "stacked", label: "Stacked" },
    ];
    control.value = value;
    return control;
}
