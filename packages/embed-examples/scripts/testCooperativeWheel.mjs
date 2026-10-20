/* global window, document, requestAnimationFrame, DOMParser */

import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

// Use real browser wheel input: dispatchEvent cannot prove native page scrolling.
const origin = process.argv[2] ?? "http://127.0.0.1:4176";
const server = process.argv[2]
    ? undefined
    : await createServer({
          configFile: fileURLToPath(
              new URL("../vite.config.js", import.meta.url)
          ),
          root: fileURLToPath(new URL("../src", import.meta.url)),
          server: {
              host: "127.0.0.1",
              port: 4176,
              strictPort: true,
              watch: null,
          },
      });
await server?.listen();

/** @type {import("playwright").Browser | undefined} */
let browser;
try {
    browser = await chromium.launch({
        channel: "chrome",
        args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"],
    });
    for (const renderer of ["canvas", "webgl", "webgpu"]) {
        const page = await browser.newPage({
            viewport: { width: 1100, height: 820 },
        });
        try {
            /** @type {string[]} */
            const failures = [];
            page.on("pageerror", (error) => failures.push(error.message));
            page.on("console", (message) => {
                if (message.type() === "error") {
                    failures.push(message.text());
                }
            });
            await page.route("**/favicon.ico", (route) =>
                route.fulfill({ status: 204 })
            );
            await page.goto(origin + "/cooperativeWheel/?renderer=" + renderer);
            // Import the exact entry URL already loaded by the page, avoiding
            // a second module evaluation and duplicate embeds.
            const entryUrl = await page
                .locator('script[type="module"][src]')
                .evaluateAll((elements) =>
                    elements
                        .map(
                            (element) =>
                                /** @type {HTMLScriptElement} */ (element).src
                        )
                        .find((url) =>
                            new URL(url).pathname.endsWith(
                                "/cooperativeWheel/index.js"
                            )
                        )
                );
            assert.ok(entryUrl, "demo module entry is present");
            await page.evaluate(async (url) => {
                const apis = await import(url);
                for (const api of [
                    apis.chartApi,
                    apis.viewportApi,
                    apis.cohortApi,
                ]) {
                    await api.awaitVisibleLazyData(AbortSignal.timeout(10000));
                    const errors = api.dataLoading
                        .getSnapshot()
                        .filter((entry) => entry.status === "error");
                    if (errors.length)
                        throw new Error("Demo data failed to load.");
                }
            }, entryUrl);
            await page.waitForFunction(() =>
                Array.from(
                    document.querySelectorAll(".loading-indicators")
                ).every(
                    (element) => getComputedStyle(element).display === "none"
                )
            );
            if (renderer === "canvas") {
                const directory = new URL(
                    "../../../output/playwright/",
                    import.meta.url
                );
                await mkdir(directory, { recursive: true });
                await page.screenshot({
                    path: fileURLToPath(
                        new URL("cooperative-wheel.png", directory)
                    ),
                    fullPage: true,
                });
            }

            /** @param {string} apiName @param {string} scaleName */
            const domain = (apiName, scaleName) =>
                page.evaluate(
                    async ({ entryUrl, apiName, scaleName }) => {
                        const api = (await import(entryUrl))[apiName];
                        return api
                            .getScaleResolutionByName(scaleName)
                            .getDomain();
                    },
                    { entryUrl, apiName, scaleName }
                );
            const scrollY = () => page.evaluate(() => window.scrollY);
            const settle = () =>
                page.evaluate(
                    () =>
                        new Promise((resolve) =>
                            requestAnimationFrame(() =>
                                requestAnimationFrame(resolve)
                            )
                        )
                );
            /** @param {string} id @param {number} [x] */
            const point = async (id, x = 0.6) => {
                await page
                    .locator(id + " canvas")
                    .evaluate((canvas) =>
                        canvas.scrollIntoView({ block: "center" })
                    );
                await settle();
                const box = await page.locator(id + " canvas").boundingBox();
                assert.ok(box, id + " has a canvas");
                const position = {
                    x: box.x + box.width * x,
                    y: box.y + box.height * 0.5,
                };
                await page.mouse.move(position.x, position.y);
                return position;
            };
            /** @param {number} deltaY @param {boolean} [ctrl] @param {number} [deltaX] */
            const wheel = async (deltaY, ctrl = false, deltaX = 0) => {
                if (ctrl) await page.keyboard.down("Control");
                try {
                    await page.mouse.wheel(deltaX, deltaY);
                    await page.waitForTimeout(140);
                } finally {
                    if (ctrl) await page.keyboard.up("Control");
                }
            };
            /** @param {string} apiName @param {string} viewName */
            const geometry = (apiName, viewName) =>
                page.evaluate(
                    async ({ entryUrl, apiName, viewName }) => {
                        const api = (await import(entryUrl))[apiName];
                        const result = await api.imageExport.svg();
                        const svg = new DOMParser().parseFromString(
                            await result.blob.text(),
                            "image/svg+xml"
                        );
                        return Array.from(
                            svg.querySelectorAll(
                                '[data-name="' + viewName + '"] rect'
                            ),
                            (rect) =>
                                ["x", "y", "width", "height", "fill"].map(
                                    (attribute) => rect.getAttribute(attribute)
                                )
                        );
                    },
                    { entryUrl, apiName, viewName }
                );

            await point("#chart");
            const initialDomain = await domain("chartApi", "chartX");
            const pageBefore = await scrollY();
            await wheel(120);
            assert.ok(
                (await scrollY()) > pageBefore,
                "ordinary chart wheel scrolls page"
            );
            assert.deepEqual(await domain("chartApi", "chartX"), initialDomain);

            await point("#chart");
            const zoomPage = await scrollY();
            await wheel(-100, true);
            const zoomDomain = await domain("chartApi", "chartX");
            assert.notDeepEqual(
                zoomDomain,
                initialDomain,
                "Ctrl wheel zooms chart"
            );
            assert.equal(
                await scrollY(),
                zoomPage,
                "Ctrl wheel does not scroll page"
            );
            await wheel(100);
            const handoffDomain = await domain("chartApi", "chartX");
            await page.waitForTimeout(250);
            assert.deepEqual(
                await domain("chartApi", "chartX"),
                handoffDomain,
                "page scrolling stops pending zoom inertia"
            );

            const dragPoint = await point("#chart");
            await page.mouse.down();
            for (let step = 1; step <= 6; step++) {
                await page.mouse.move(dragPoint.x + step * 3, dragPoint.y);
                await page.waitForTimeout(16);
            }
            await page.mouse.up();
            await wheel(90);
            const dragHandoffDomain = await domain("chartApi", "chartX");
            await page.waitForTimeout(250);
            assert.deepEqual(
                await domain("chartApi", "chartX"),
                dragHandoffDomain,
                "page scrolling stops drag-release pan inertia"
            );

            await point("#viewport");
            const rowPage = await scrollY();
            const rowsBefore = await geometry("viewportApi", "viewportRows");
            assert.ok(rowsBefore.length, "viewport SVG contains row geometry");
            const rowDomain = await domain("viewportApi", "viewportX");
            await wheel(90);
            const rowsAfter = await geometry("viewportApi", "viewportRows");
            assert.notDeepEqual(
                rowsAfter,
                rowsBefore,
                "wheel moves viewport rows"
            );
            assert.equal(
                await scrollY(),
                rowPage,
                "internal scroll consumes wheel"
            );
            assert.deepEqual(
                await domain("viewportApi", "viewportX"),
                rowDomain
            );
            await page.waitForTimeout(250);
            assert.deepEqual(
                await geometry("viewportApi", "viewportRows"),
                rowsAfter,
                "viewport scrolling adds no inertia"
            );
            await wheel(10000);
            await wheel(120);
            assert.ok(
                (await scrollY()) > rowPage,
                "viewport boundary chains to page"
            );

            await point("#cohort", 0.75);
            const cohortDomain = await domain("cohortApi", "cohortX");
            const overviewPage = await scrollY();
            await wheel(100);
            assert.ok(
                (await scrollY()) > overviewPage,
                "App overview wheel scrolls page"
            );
            assert.deepEqual(
                await domain("cohortApi", "cohortX"),
                cohortDomain
            );
            const cohortPoint = await point("#cohort", 0.75);
            await page.mouse.click(cohortPoint.x, cohortPoint.y, {
                button: "right",
            });
            await page
                .getByRole("menuitem", { name: "Open closeup", exact: true })
                .click();
            // The existing close-up transition takes 500ms; scrolling becomes
            // active when it finishes, rather than during animated resizing.
            await page.waitForTimeout(600);
            await point("#cohort", 0.75);
            const closeupPage = await scrollY();
            const samplesBefore = await geometry("cohortApi", "cohortSegments");
            assert.ok(samplesBefore.length, "App SVG contains sample segments");
            await wheel(70);
            const samplesAfter = await geometry("cohortApi", "cohortSegments");
            assert.notDeepEqual(
                samplesAfter,
                samplesBefore,
                "closeup wheel scrolls samples"
            );
            assert.equal(await scrollY(), closeupPage);
            assert.deepEqual(
                await domain("cohortApi", "cohortX"),
                cohortDomain
            );
            await page.waitForTimeout(250);
            assert.deepEqual(
                await geometry("cohortApi", "cohortSegments"),
                samplesAfter,
                "sample scrolling adds no inertia"
            );

            await point("#cohort", 0.12);
            await wheel(60);
            assert.notDeepEqual(
                await geometry("cohortApi", "cohortSegments"),
                samplesAfter,
                "sidebar wheel scrolls the same samples"
            );
            assert.equal(await scrollY(), closeupPage);
            await point("#cohort", 0.75);
            await wheel(-80, true);
            assert.notDeepEqual(
                await domain("cohortApi", "cohortX"),
                cohortDomain
            );
            assert.equal(await scrollY(), closeupPage);
            await wheel(10000);
            await wheel(100);
            assert.ok(
                (await scrollY()) > closeupPage,
                "sample boundary chains to page"
            );

            if (renderer === "canvas") {
                // A brush can own Ctrl+wheel even with no zoomable scale. Use
                // only the public embed/selection API for this extra fixture.
                const coreUrl =
                    "/@fs" +
                    fileURLToPath(
                        new URL("../../core/src/index.js", import.meta.url)
                    );
                await page.evaluate(async (coreUrl) => {
                    const { embed } = await import(coreUrl);
                    const host = document.createElement("div");
                    host.id = "brush-wheel-check";
                    document.querySelector(".page-end").before(host);
                    const api = await embed(
                        host,
                        {
                            width: 700,
                            height: 150,
                            padding: 10,
                            params: [
                                {
                                    name: "brush",
                                    value: { x: [2, 8] },
                                    select: {
                                        type: "interval",
                                        encodings: ["x"],
                                        zoom: "wheel[event.ctrlKey]",
                                    },
                                },
                            ],
                            data: { values: [{ x: 3 }, { x: 7 }] },
                            mark: "point",
                            encoding: {
                                x: {
                                    field: "x",
                                    type: "quantitative",
                                    scale: { name: "brushX", domain: [0, 10] },
                                },
                            },
                        },
                        { renderer: "canvas", wheelBehavior: "cooperative" }
                    );
                    // Test-local closures keep the API out of the demo module.
                    window["readBrushWheelCheck"] = () => ({
                        selection: api.params.getSelection("brush").getValue(),
                        domain: api
                            .getScaleResolutionByName("brushX")
                            .getDomain(),
                    });
                }, coreUrl);
                await point("#brush-wheel-check", 0.5);
                const readBrush = () =>
                    page.evaluate(() => window["readBrushWheelCheck"]());
                const before = await readBrush();
                const brushPage = await scrollY();
                await wheel(-50, true);
                const after = await readBrush();
                assert.notDeepEqual(
                    after.selection,
                    before.selection,
                    "Ctrl wheel resizes nonzoomable brush"
                );
                assert.deepEqual(after.domain, before.domain);
                assert.equal(await scrollY(), brushPage);
            }

            assert.deepEqual(failures, [], renderer + " browser errors");
            console.log(
                renderer +
                    ": cooperative page, viewport, and cohort scrolling passed"
            );
        } finally {
            await page.close();
        }
    }
} finally {
    await browser?.close();
    await server?.close();
}
