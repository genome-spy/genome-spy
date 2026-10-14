import { test, expect } from "@playwright/test";

for (const orientation of ["vertical", "horizontal"]) {
    test(`keeps ${orientation} split panes responsive after dragging`, async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto("/");
        if (orientation === "horizontal") {
            await page
                .getByRole("button", { name: "Toggle layout", exact: true })
                .click();
        }
        const panel = page.locator("#main-panel");
        await expect(panel).toHaveAttribute("orientation", orientation);
        const panes = panel.locator(".resizable");
        const dimension = orientation === "vertical" ? "height" : "width";
        const farEdge = orientation === "vertical" ? "bottom" : "right";
        const initialSize = (await panes.first().boundingBox())[dimension];
        const handle = await panel.locator(".resizable-handle").boundingBox();
        const x = handle.x + handle.width / 2;
        const y = handle.y + handle.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(
            x + (orientation === "horizontal" ? 60 : 0),
            y + (orientation === "vertical" ? 60 : 0)
        );
        await page.mouse.up();

        // Dragging must track the pointer accurately, including the divider border.
        await expect
            .poll(async () => (await panes.first().boundingBox())[dimension])
            .toBeCloseTo(initialSize + 60, 1);
        const proportion =
            (await panes.first().boundingBox())[dimension] /
            (await panel.boundingBox())[dimension];

        for (const viewport of [
            { width: 1440, height: 1000 },
            { width: 900, height: 600 },
        ]) {
            await page.setViewportSize(viewport);
            await expect
                .poll(async () => {
                    const bounds = await panel.boundingBox();
                    return (
                        (await panes.first().boundingBox())[dimension] /
                        bounds[dimension]
                    );
                })
                .toBeCloseTo(proportion, 3);
            const bounds = await panel.boundingBox();
            const last = await panes
                .last()
                .evaluate((element) =>
                    element.getBoundingClientRect().toJSON()
                );
            expect(last[farEdge]).toBeCloseTo(
                bounds[orientation === "vertical" ? "y" : "x"] +
                    bounds[dimension],
                1
            );
        }
    });
}
