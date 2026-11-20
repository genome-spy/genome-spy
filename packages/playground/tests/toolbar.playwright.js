import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

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
    const savePng = menu.getByRole("menuitem", { name: "Save PNG" });
    const dialog = page.getByRole("dialog", {
        name: "Save Visualization as PNG Image",
    });
    await expect(savePng).toBeEnabled();
    await expect(
        menu.getByRole("menuitem", { name: "Save SVG" })
    ).toBeEnabled();
    await savePng.click();
    await expect(menu).toBeHidden();
    await expect(dialog).toBeInViewport({ ratio: 1 });
    await expect
        .poll(() =>
            dialog.evaluate((element) => element.matches(":focus-within"))
        )
        .toBe(true);
    await expect(dialog.getByLabel("Background", { exact: true })).toHaveValue(
        "visualization"
    );
    await dialog
        .getByRole("slider", { name: "Scale factor" })
        .press("ArrowRight");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();

    await more.click();
    await savePng.click();
    await expect(
        dialog.getByRole("slider", { name: "Scale factor" })
    ).toHaveValue("2.5");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(more).toBeFocused();

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

test("downloads PNG and SVG from separate toolbar actions", async ({
    page,
}) => {
    await page.setViewportSize({ width: 1280, height: 740 });
    await page.goto("/?renderer=canvas");

    const exportButton = page.getByRole("button", {
        name: "Export",
        exact: true,
    });
    const menu = page.getByRole("menu", { name: "Export", exact: true });
    await expect(exportButton).toBeEnabled();
    for (const { format, title, extension } of [
        {
            format: "PNG",
            title: "Save Visualization as PNG Image",
            extension: "png",
        },
        { format: "SVG", title: "Save Visualization as SVG", extension: "svg" },
    ]) {
        const label = "Save " + format;
        await exportButton.click();
        await menu.getByRole("menuitem", { name: label, exact: true }).click();
        const dialog = page.getByRole("dialog", { name: title });
        await expect(dialog).toBeVisible();
        if (format === "SVG") {
            await expect(dialog.getByRole("status")).toContainText(
                /layers? will be rasterized|No visible layers exceed the threshold/
            );
            await dialog
                .getByRole("checkbox", { name: "Rasterize dense marks" })
                .uncheck();
            await expect(dialog.getByRole("status")).toHaveText(
                "All layers will remain vector."
            );
        }
        const downloaded = page.waitForEvent("download");
        await dialog.getByRole("button", { name: label, exact: true }).click();
        const file = await downloaded;
        expect(file.suggestedFilename()).toBe(
            "genomespy-visualization." + extension
        );
        const content = await readFile(await file.path());
        if (format === "PNG") {
            expect(content.subarray(0, 8).toString("hex")).toBe(
                "89504e470d0a1a0a"
            );
        } else {
            expect(content.toString("utf8")).toContain("<svg");
        }
        await expect(dialog).toBeHidden();
        await expect(exportButton).toBeFocused();
    }
});
