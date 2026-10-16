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
                const { api } = await import("/regionSummary/index.js");
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
                const { api } = await import("/regionSummary/index.js");
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

        test("summarizes pathways, labels representatives, and invalidates changed evidence", async ({
            page,
        }) => {
            await page.goto(`/expressionFindings/?renderer=${renderer}`);
            const find = page.getByRole("button", {
                name: "Find and label representatives",
            });
            await find.click();
            await expect(page.locator("#annotation-status")).toHaveText(
                "3 labeled findings."
            );
            await expect(page.locator("#results")).not.toContainText(
                "Run a query to inspect"
            );
            await expect(page.locator("#representatives tbody tr")).toHaveCount(
                3
            );
            for (const gene of ["IFN01", "CYC01", "MET01"]) {
                await expect(page.locator("#representatives")).toContainText(
                    gene
                );
            }
            await expect(page.locator("#representatives")).not.toContainText(
                "CYC02"
            );
            await expect(page.locator("#pathways tbody tr")).toHaveCount(3);
            for (const count of await page
                .locator("#pathways tbody tr td:nth-child(2)")
                .allTextContents()) {
                expect(count).toBe("2");
            }
            await expect(page.locator("#pathways")).toContainText("0.3");

            const svg = await exportExpressionSvg(page);
            for (const gene of ["IFN01", "CYC01", "MET01"])
                expect(svg).toContain(">" + gene + "<");
            const downloading = page.waitForEvent("download");
            await page.getByRole("button", { name: "Download SVG" }).click();
            const download = await downloading;
            expect(download.suggestedFilename()).toBe(
                "expression-findings.svg"
            );
            expect(await download.failure()).toBeNull();
            await page.evaluate(async () => {
                const { api } = await import("/expressionFindings/index.js");
                await api.views
                    .get({ scope: [], view: "expression" })
                    .getScaleResolution("x")
                    .zoomTo([-2.5, 2.5]);
            });
            await expect(page.locator("#status")).toContainText(
                "Scope or controls changed"
            );
            await expect(page.locator("#annotation-status")).toHaveText(
                "3 labeled findings."
            );
            await checkNarrowLayout(page);
            // Labels at plot edges can clip; the interior target stays rendered.
            expect(await exportExpressionSvg(page)).toContain(">MET01<");

            await page.getByLabel("Query scope").selectOption("brush");
            await find.click();
            await expect(page.locator("#annotation-status")).toHaveText(
                "0 labeled findings."
            );
            await page.getByLabel("Query scope").selectOption("viewport");
            await find.click();
            await expect(page.locator("#annotation-status")).toHaveText(
                "3 labeled findings."
            );

            await page.getByLabel("Toy contrast").selectOption("B");
            await expect(page.locator("#annotation-status")).toHaveText(
                "Findings cleared because the source data changed."
            );
            await expect(page.locator("#representatives")).toHaveCount(0);
            await find.click();
            await expect(page.locator("#representatives")).toContainText(
                "IFN02"
            );
            await expect(page.locator("#representatives")).not.toContainText(
                "IFN01"
            );
            await page
                .getByRole("button", { name: "Clear labels", exact: true })
                .click();
            await expect(page.locator("#annotation-status")).toHaveText(
                "0 labeled findings."
            );
            await expect
                .poll(() => exportExpressionSvg(page))
                .not.toContain("IFN02");

            await page.getByLabel("Minimum −log10").fill("7");
            await find.click();
            await expect(page.locator("#results")).toContainText(
                "No genes meet the current criteria"
            );
            await expect(page.locator("#pathways tbody tr")).toHaveCount(0);
            await expect(page.locator("#annotation-status")).toHaveText(
                "0 labeled findings."
            );
            await page.getByRole("button", { name: "Reset example" }).click();
            await find.click();
            await expect(page.locator("#representatives")).toContainText(
                "IFN01"
            );
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
                const { api } = await import("/retainedGeneData/index.js");
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
async function exportExpressionSvg(page) {
    return page.evaluate(async () => {
        const { api } = await import("/expressionFindings/index.js");
        return (await api.imageExport.svg()).blob.text();
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
