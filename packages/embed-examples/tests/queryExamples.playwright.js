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
                .getByRole("button", { name: "Gain region", exact: true })
                .click();
            await expect(page.getByTestId("count")).toHaveText("20");
            await expect(page.getByTestId("mean")).toHaveText("0.6");
            await expect(page.getByTestId("preview-count")).toHaveText(
                "Showing 5 of 20 matching bins."
            );
            await expect(page.locator("#results tbody tr")).toHaveCount(5);
            await page.getByLabel("Summary scope").selectOption("brush");
            await expect(page.getByTestId("count")).toHaveText("0");
            await expect(page.getByTestId("mean")).toHaveText("—");

            const bounds = await page.evaluate(async () => {
                const { api } = await import(
                    globalThis.document.querySelector(
                        'script[type="module"][src*="/index.js"]'
                    ).src
                );
                return api.views.getLayoutBounds({
                    scope: [],
                    view: "copyNumber",
                });
            });
            const canvas = await page.locator("#plot canvas").boundingBox();
            // A real Shift-drag selects 350–450 kb inside the 300–500 viewport.
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
            await expect(page.getByTestId("count")).toHaveText("10");
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
                const scale = api.views
                    .get({ scope: [], view: "copyNumber" })
                    .getScaleResolution("x");
                await Promise.all([
                    scale.zoomTo([800, 950]),
                    scale.zoomTo([0, 1200]),
                    scale.zoomTo([300, 500]),
                ]);
            });
            await expect(page.getByTestId("count")).toHaveText("20");
            await expect(page.getByTestId("mean")).toHaveText("0.6");
            await expect(page.locator("#track-info")).toContainText(
                "Complete declared toy source loaded"
            );
            await checkNarrowLayout(page);
        });

        test("highlights every qualifying record and shares selection with interactive picking", async ({
            page,
        }) => {
            await page.goto(`/expressionFindings/?renderer=${renderer}`);
            const find = page.getByRole("button", {
                name: "Highlight qualifying records",
            });
            await find.click();
            await expect(page.locator("#selection-status")).toHaveText(
                "6 selected records."
            );
            await expect(page.locator("#results tbody tr")).toHaveCount(6);
            for (const gene of [
                "IFN01",
                "IFN02",
                "CYC01",
                "CYC02",
                "MET01",
                "MET02",
            ])
                await expect(page.locator("#results")).toContainText(gene);

            // Inspect the original marks' exported opacity, not a decorative overlay.
            expect(await selectedExpressionMarks(page)).toBe(6);
            await page.getByLabel("Minimum |log2 fold change|").fill("0");
            await page.getByLabel("Minimum −log10").fill("0");
            await find.click();
            await expect(page.locator("#selection-status")).toHaveText(
                "12 selected records."
            );
            await expect(page.locator("#results tbody tr")).toHaveCount(12);
            expect(await selectedExpressionMarks(page)).toBe(12);

            const downloading = page.waitForEvent("download");
            await page.getByRole("button", { name: "Download SVG" }).click();
            const download = await downloading;
            expect(download.suggestedFilename()).toBe(
                "expression-findings.svg"
            );
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
                    view: "expression",
                });
            });
            const canvas = await page.locator("#plot canvas").boundingBox();
            // IFN01 is at (2.4, 6), within [-3,3] × [0,7].
            await page.mouse.click(
                canvas.x + bounds.x + bounds.width * 0.9,
                canvas.y + bounds.y + bounds.height / 7
            );
            await expect(page.locator("#selection-status")).toHaveText(
                "1 selected records."
            );
            await expect(page.locator("#results tbody")).toContainText("IFN01");
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

            await page.getByLabel("Toy contrast").selectOption("B");
            await expect(page.locator("#selection-status")).toHaveText(
                "0 selected records."
            );
            await page.getByLabel("Minimum |log2 fold change|").fill("1");
            await page.getByLabel("Minimum −log10").fill("2");
            await find.click();
            await expect(page.locator("#selection-status")).toHaveText(
                "5 selected records."
            );
            await expect(page.locator("#results tbody")).not.toContainText(
                "IFN01"
            );
            await page.getByLabel("Minimum −log10").fill("7");
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

        test("retains source genes while display filters change the transformed table", async ({
            page,
        }) => {
            await page.goto(`/retainedGeneData/?renderer=${renderer}`);
            await expect(page.getByTestId("source-count")).toHaveText(
                "8 retained genes"
            );
            await expect(page.getByTestId("transformed-count")).toHaveText(
                "6 genes kept by the filter"
            );
            for (const gene of ["geneC", "geneF"]) {
                await expect(
                    page
                        .locator("#source-rows tbody tr")
                        .filter({ hasText: gene })
                ).toContainText("Removed by filter");
                await expect(
                    page.locator("#transformed-rows tbody")
                ).not.toContainText(gene);
            }
            await page.getByLabel("Displayed lanes").selectOption("1");
            await expect(
                page.locator("#transformed-rows tbody tr")
            ).toHaveCount(3);
            await page.getByLabel("Displayed lanes").selectOption("3");
            await expect(
                page.locator("#transformed-rows tbody tr")
            ).toHaveCount(8);
            await page.evaluate(async () => {
                const { api } = await import(
                    globalThis.document.querySelector(
                        'script[type="module"][src*="/index.js"]'
                    ).src
                );
                await api.views
                    .get({ scope: [], view: "genes" })
                    .getScaleResolution("x")
                    .zoomTo([300, 500]);
            });
            await expect(page.locator("#source-rows tbody tr")).toHaveCount(8);
            await expect(
                page.locator("#transformed-rows tbody tr")
            ).toHaveCount(8);
            await expect(page.locator("#track-info")).toContainText(
                "retention enabled"
            );
            await page.getByRole("button", { name: "Reset example" }).click();
            await expect(
                page.locator("#transformed-rows tbody tr")
            ).toHaveCount(6);
            await checkNarrowLayout(page);
        });
    });
}

/** @param {import("playwright/test").Page} page */
async function selectedExpressionMarks(page) {
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
            '[data-name="expression"] [data-mark-type="point"] [fill-opacity="1"]'
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
