import { test, expect } from "playwright/test";

for (const renderer of ["webgl", "canvas"]) {
    test.describe(renderer, () => {
        /** @type {string[]} */
        let errors;

        test.beforeEach(async ({ page }) => {
            errors = [];
            page.on("pageerror", (error) => errors.push(error.message));
            page.on("console", (message) => {
                if (message.type() === "error") errors.push(message.text());
            });
        });

        test.afterEach(async ({ page }) => {
            // Navigation exercises the examples' real page-exit disposal path.
            await page.goto("/");
            expect(errors).toEqual([]);
        });

        test("summarizes the full region before limiting its preview", async ({
            page,
        }) => {
            await page.goto(`/regionSummary/?renderer=${renderer}`);
            await expect(page.getByTestId("count")).toHaveText("120");
            await page
                .getByRole("button", { name: "High range", exact: true })
                .click();
            await expect(page.getByTestId("count")).toHaveText("20");
            await expect(page.getByTestId("mean")).toHaveText("0.6");
            await expect(page.getByTestId("preview-count")).toHaveText(
                "Showing 5 of 20 matching records."
            );
            await expect(page.locator("#results tbody tr")).toHaveCount(5);
            await page.getByLabel("Summary scope").selectOption("brush");
            await expect(page.getByTestId("count")).toHaveText("0");
            await expect(page.getByTestId("mean")).toHaveText("—");

            // Count can reach 20 during a zoom animation. Brush only after
            // the named scale reaches its final domain.
            await expect
                .poll(() =>
                    page.evaluate(async () => {
                        const { api } = await import(
                            globalThis.document.querySelector(
                                'script[type="module"][src*="/index.js"]'
                            ).src
                        );
                        return api
                            .getScaleResolutionByName("position")
                            .getDomain();
                    })
                )
                .toEqual([300, 500]);

            const bounds = await page.evaluate(async () => {
                const { api } = await import(
                    globalThis.document.querySelector(
                        'script[type="module"][src*="/index.js"]'
                    ).src
                );
                return api.views.getLayoutBounds({
                    scope: [],
                    view: "signal",
                });
            });
            const canvas = await page.locator("#plot canvas").boundingBox();
            // A real Shift-drag brushes roughly the middle half of the viewport.
            const y = canvas.y + bounds.y + bounds.height / 2;
            await page.keyboard.down("Shift");
            await page.mouse.move(canvas.x + bounds.x + bounds.width * 0.25, y);
            await page.mouse.down();
            await page.mouse.move(
                canvas.x + bounds.x + bounds.width * 0.75,
                y,
                { steps: 8 }
            );
            await page.mouse.up();
            await page.keyboard.up("Shift");
            const interval = await page.evaluate(async () => {
                const { api } = await import(
                    globalThis.document.querySelector(
                        'script[type="module"][src*="/index.js"]'
                    ).src
                );
                return api.params.getSelection("region").getValue().intervals.x;
            });
            // Fonts/layout can shift a few pixels during dragging. Check the
            // summary against the actual brush and the known toy coordinates.
            const expectedCount = Array.from(
                { length: 20 },
                (_, i) => 305 + i * 10
            ).filter((x) => x >= interval[0] && x <= interval[1]).length;
            expect(expectedCount).toBeGreaterThan(5);
            expect(expectedCount).toBeLessThan(15);
            await expect(page.getByTestId("count")).toHaveText(
                String(expectedCount)
            );
            await page
                .getByRole("button", { name: "Clear brush", exact: true })
                .click();
            await expect(page.getByTestId("count")).toHaveText("0");
            await page.getByRole("button", { name: "Reset example" }).click();
            await expect(page.getByTestId("count")).toHaveText("120");
            await page.evaluate(async () => {
                const { api } = await import(
                    globalThis.document.querySelector(
                        'script[type="module"][src*="/index.js"]'
                    ).src
                );
                const scale = api.getScaleResolutionByName("position");
                await Promise.all([
                    scale.zoomTo([800, 950]),
                    scale.zoomTo([0, 1200]),
                    scale.zoomTo([300, 500]),
                ]);
            });
            await expect(page.getByTestId("count")).toHaveText("20");
            await expect(page.getByTestId("mean")).toHaveText("0.6");
            await checkNarrowLayout(page);
        });

        test("highlights every qualifying record and shares selection with interactive picking", async ({
            page,
        }) => {
            await page.goto(`/recordSelection/?renderer=${renderer}`);
            const find = page.getByRole("button", {
                name: "Highlight qualifying records",
            });
            await find.click();
            await expect(page.locator("#selection-status")).toHaveText(
                "6 selected records."
            );
            await expect(page.locator("#results tbody tr")).toHaveCount(6);
            for (const record of [
                "item01",
                "item02",
                "item05",
                "item06",
                "item09",
                "item10",
            ])
                await expect(page.locator("#results")).toContainText(record);

            // Inspect the original marks' exported opacity, not a decorative overlay.
            expect(await selectedRecordMarks(page)).toBe(6);
            await page.getByLabel("Minimum x").fill("0");
            await page.getByLabel("Minimum y").fill("0");
            await find.click();
            await expect(page.locator("#selection-status")).toHaveText(
                "12 selected records."
            );
            await expect(page.locator("#results tbody tr")).toHaveCount(12);
            expect(await selectedRecordMarks(page)).toBe(12);

            const downloading = page.waitForEvent("download");
            await page.getByRole("button", { name: "Download SVG" }).click();
            const download = await downloading;
            expect(download.suggestedFilename()).toBe("selected-records.svg");
            expect(await download.failure()).toBeNull();
            await page
                .getByRole("button", { name: "Clear selection", exact: true })
                .click();
            await expect(page.locator("#selection-status")).toHaveText(
                "0 selected records."
            );

            const bounds = await page.evaluate(async () => {
                const { api } = await import(
                    globalThis.document.querySelector(
                        'script[type="module"][src*="/index.js"]'
                    ).src
                );
                return api.views.getLayoutBounds({
                    scope: [],
                    view: "records",
                });
            });
            const canvas = await page.locator("#plot canvas").boundingBox();
            // item01 is at (2.4, 6), within [0,3] × [0,7].
            await page.mouse.click(
                canvas.x + bounds.x + bounds.width * 0.8,
                canvas.y + bounds.y + bounds.height / 7
            );
            await expect(page.locator("#selection-status")).toHaveText(
                "1 selected records."
            );
            await expect(page.locator("#results tbody")).toContainText(
                "item01"
            );
            await page.getByLabel("Query scope").selectOption("brush");
            await find.click();
            await expect(page.locator("#selection-status")).toHaveText(
                "0 selected records."
            );
            await page.getByLabel("Query scope").selectOption("viewport");
            await find.click();
            await expect(page.locator("#selection-status")).toHaveText(
                "12 selected records."
            );

            await page.getByLabel("Minimum y").fill("7");
            await find.click();
            await expect(page.locator("#selection-status")).toHaveText(
                "0 selected records."
            );
            await page.getByRole("button", { name: "Reset example" }).click();
            await find.click();
            await expect(page.locator("#selection-status")).toHaveText(
                "6 selected records."
            );
            await checkNarrowLayout(page);
        });

        test("reads Core's filtered and derived records without retaining source input", async ({
            page,
        }) => {
            await page.goto(`/transformedData/?renderer=${renderer}`);
            await expect(page.getByTestId("transformed-count")).toHaveText(
                "6 records kept by the filter"
            );
            await expect(page.locator("#results tbody")).not.toContainText(
                "recordC"
            );
            await expect(
                page.locator("#results tbody tr").first()
            ).toContainText("180");
            await page.getByLabel("Displayed categories").selectOption("1");
            await expect(page.locator("#results tbody tr")).toHaveCount(3);
            await page.getByLabel("Displayed categories").selectOption("3");
            await expect(page.locator("#results tbody tr")).toHaveCount(8);
            await page.evaluate(async () => {
                const { api } = await import(
                    globalThis.document.querySelector(
                        'script[type="module"][src*="/index.js"]'
                    ).src
                );
                await api
                    .getScaleResolutionByName("position")
                    .zoomTo([300, 500]);
            });
            await expect(page.locator("#results tbody tr")).toHaveCount(8);
            await page.getByRole("button", { name: "Reset example" }).click();
            await expect(page.locator("#results tbody tr")).toHaveCount(6);
            await checkNarrowLayout(page);
        });
    });
}

/** @param {import("playwright/test").Page} page */
async function selectedRecordMarks(page) {
    return page.evaluate(async () => {
        const { api } = await import(
            globalThis.document.querySelector(
                'script[type="module"][src*="/index.js"]'
            ).src
        );
        const svg = new globalThis.DOMParser().parseFromString(
            await (await api.imageExport.svg()).blob.text(),
            "image/svg+xml"
        );
        return svg.querySelectorAll(
            '[data-name="records"] [data-mark-type="point"] [fill-opacity="1"]'
        ).length;
    });
}

/** @param {import("playwright/test").Page} page */
async function checkNarrowLayout(page) {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
        .poll(() =>
            page.evaluate(
                () =>
                    globalThis.document.documentElement.scrollWidth <=
                    globalThis.innerWidth
            )
        )
        .toBe(true);
    const canvas = await page.locator("#plot canvas").boundingBox();
    expect(canvas.width).toBeGreaterThan(100);
    expect(canvas.height).toBeGreaterThan(100);
}
