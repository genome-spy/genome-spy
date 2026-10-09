// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { clearErrorDisplay, showError } from "./errorDisplay.js";

afterEach(() => document.body.replaceChildren());

test("shows wrapped locations safely and replaces or clears the current error", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const cause = Object.assign(new Error("missing field"), {
        specLocation: { origin: "/encoding/x", path: ["a~/b"] },
    });
    const reveal = vi.fn();
    showError(
        container,
        new Error("Invalid field <script>", { cause }),
        reveal
    );

    expect(container.querySelector('[role="alert"]').textContent).toContain(
        "Invalid field <script>"
    );
    expect(container.querySelector("code").textContent).toBe(
        "/encoding/x/a~0~1b"
    );
    expect(container.querySelector("script")).toBeNull();
    container.querySelector("button").click();
    expect(reveal).toHaveBeenCalledOnce();

    showError(container, new Error("Renderer failed"), reveal);
    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1);
    expect(container.textContent).toContain("Renderer failed");
    expect(container.querySelector("code")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
    clearErrorDisplay(container);
    expect(container.childElementCount).toBe(0);
});

test("shows the root declaration when its JSON Pointer is empty", () => {
    const container = document.createElement("div");
    showError(
        container,
        Object.assign(new Error("Invalid declaration"), {
            specLocation: { origin: "", path: [] },
        }),
        vi.fn()
    );
    expect(container.querySelector("code").textContent).toBe("(root)");
});
