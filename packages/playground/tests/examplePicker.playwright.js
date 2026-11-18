import { test, expect } from "@playwright/test";

test("keeps focus in Examples and returns it on dismissal", async ({
    page,
}) => {
    await page.goto("/");

    const trigger = page.getByRole("button", { name: "Examples", exact: true });
    const dialog = page.getByRole("dialog", { name: "Examples", exact: true });
    const search = dialog.getByRole("searchbox", { name: "Search examples" });

    await trigger.press("Enter");
    await expect(page).toHaveURL(/#examples$/);
    await expect(search).toBeFocused();
    await page
        .locator("gs-playground-toolbar .examples-button")
        .evaluate((button) => button.focus());
    await expect(search).toBeFocused();
    await search.fill("interaction");
    await search.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(page).toHaveURL(/\/$/);

    await trigger.press("Enter");
    await expect(search).toBeFocused();
    await expect(search).toHaveValue("");
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(trigger).toBeFocused();
    await expect(page).toHaveURL(/\/$/);

    await trigger.press("Enter");
    await search.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
});

test("opens from the Examples hash and dismisses from the backdrop", async ({
    page,
}) => {
    await page.setViewportSize({ width: 1280, height: 740 });
    await page.goto("/#examples");

    const dialog = page.getByRole("dialog", { name: "Examples", exact: true });
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();

    await page.mouse.click(bounds.x + 4, bounds.y + 4);
    await expect(dialog).toBeVisible();
    await page.mouse.click(bounds.x / 2, bounds.y + 4);
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/$/);
});
