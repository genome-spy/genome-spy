import { test, expect } from "@playwright/test";

test("opens the default spec when local storage access is blocked", async ({
    page,
}) => {
    await page.addInitScript(() => {
        Object.defineProperty(globalThis, "localStorage", {
            get() {
                throw new globalThis.DOMException(
                    "Storage is blocked",
                    "SecurityError"
                );
            },
        });
    });

    await page.goto("/?renderer=canvas");
    await expect(page.locator("code-editor .cm-content")).toContainText(
        '"mark": "rect"'
    );
    await expect(page.locator("#genome-spy-container canvas")).toBeVisible();
    await expect(page.getByRole("status")).toContainText(
        "Local autosave is unavailable"
    );
});

test("renders edits even when local storage runs out of space", async ({
    page,
}) => {
    await page.goto("/?renderer=canvas");
    const editor = page.locator("code-editor .cm-content");
    await expect(page.locator("#genome-spy-container canvas")).toBeVisible();
    await page.evaluate(() => {
        const setItem = globalThis.Storage.prototype.setItem;
        globalThis.Storage.prototype.setItem = function (key, value) {
            if (key === "playgroundSpec") {
                throw new globalThis.DOMException(
                    "Storage is full",
                    "QuotaExceededError"
                );
            }
            setItem.call(this, key, value);
        };
    });

    await editor.press("ControlOrMeta+Home");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.insertText('"description": "Edited spec",');

    await expect(page.getByText("Edited spec", { exact: true })).toBeVisible();
    await expect(page.getByRole("status")).toContainText(
        "Local autosave is unavailable"
    );
});
