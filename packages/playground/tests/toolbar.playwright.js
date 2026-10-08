import { test, expect } from "@playwright/test";

test("keeps compact toolbar actions accessible by keyboard", async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto("/");

    const more = page.getByRole("button", { name: "More", exact: true });
    const menu = page.getByRole("menu", { name: "More", exact: true });
    const examples = page.getByRole("button", {
        name: "Examples",
        exact: true,
    });
    await expect(examples).toBeInViewport({ ratio: 1 });
    await expect(more).toBeInViewport({ ratio: 1 });
    await expect(
        page.getByRole("button", { name: "Toggle layout" })
    ).toBeHidden();

    await more.press("ArrowDown");
    const toggleLayout = menu.getByRole("menuitem", { name: "Toggle layout" });
    await expect(toggleLayout).toBeFocused();
    await toggleLayout.press("ArrowUp");
    const release = menu.getByRole("menuitem", { name: /^Release v/ });
    await expect(release).toBeFocused();
    await release.press("Escape");
    await expect(menu).toBeHidden();
    await expect(more).toBeFocused();

    await more.press("Enter");
    await toggleLayout.press("Enter");
    await expect(page.locator("#main-panel")).toHaveAttribute(
        "orientation",
        "horizontal"
    );
    await expect(menu).toBeHidden();
    await expect(more).toBeFocused();

    // Closing the menu must not steal focus from a dialog opened by an action.
    await more.click();
    const exportImage = menu.getByRole("menuitem", { name: "Export image" });
    await expect(exportImage).toBeEnabled();
    await exportImage.click();
    await expect(menu).toBeHidden();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect
        .poll(() =>
            dialog.evaluate((element) => element.matches(":focus-within"))
        )
        .toBe(true);
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await examples.click();
    await expect(
        page.getByRole("searchbox", { name: "Search examples" })
    ).toBeVisible();
});

test("shares renderer selection between compact and desktop menus", async ({
    page,
}) => {
    await page.setViewportSize({ width: 400, height: 740 });
    await page.goto("/");
    const more = page.getByRole("button", { name: "More", exact: true });
    const menu = page.getByRole("menu", { name: "More", exact: true });
    await more.click();
    await menu
        .getByRole("menuitemradio", { name: "Canvas", exact: true })
        .click();
    await expect(page).toHaveURL(/renderer=canvas/);
    await expect(menu).toBeHidden();
    await more.click();
    await expect(
        menu.getByRole("menuitemradio", { name: "Canvas", exact: true })
    ).toBeChecked();

    // Resizing closes the overflow menu and restores the inline controls.
    await page.setViewportSize({ width: 1280, height: 740 });
    await expect(menu).toBeHidden();
    await expect(more).toBeHidden();
    await expect(
        page.getByRole("button", { name: "Toggle layout" })
    ).toBeVisible();
    const renderer = page.getByRole("button", {
        name: "Renderer: Canvas",
        exact: true,
    });
    await renderer.press("ArrowDown");
    const canvas = page.getByRole("menuitemradio", {
        name: "Canvas",
        exact: true,
    });
    await expect(canvas).toBeFocused();
    await canvas.press("Home");
    const webgl = page.getByRole("menuitemradio", {
        name: "WebGL",
        exact: true,
    });
    await expect(webgl).toBeFocused();
    await webgl.press("Enter");
    await expect(
        page.getByRole("button", { name: "Renderer: WebGL", exact: true })
    ).toBeFocused();
    await expect(page).not.toHaveURL(/renderer=/);
});

for (const { width, label } of [
    { width: 1280, label: "Renderer: WebGL" },
    { width: 320, label: "More" },
]) {
    test(`positions ${label} beneath its button on the first opening`, async ({
        page,
    }) => {
        await page.setViewportSize({ width, height: 740 });
        await page.goto("/");
        const trigger = page.getByRole("button", { name: label, exact: true });
        const geometry = await trigger.evaluate((button) => {
            button.click();
            // Read synchronously, before the asynchronous toggle event can move the menu.
            const menu = button.popoverTargetElement.getBoundingClientRect();
            const anchor = button.getBoundingClientRect();
            return {
                top: menu.top,
                left: menu.left,
                right: menu.right,
                anchorBottom: anchor.bottom,
                anchorLeft: anchor.left,
                anchorRight: anchor.right,
                viewportWidth: globalThis.innerWidth,
            };
        });
        expect(geometry.top).toBeCloseTo(geometry.anchorBottom, 1);
        expect(geometry.left).toBeGreaterThanOrEqual(4);
        expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth - 4);
        expect(geometry.left).toBeLessThan(geometry.anchorRight);
        expect(geometry.right).toBeGreaterThan(geometry.anchorLeft);
    });
}
