import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const options = process.argv.slice(2);
const expectFailure = options.includes("--expect-failure");
const output = path.resolve(
    options.find((value) => value.startsWith("--output="))?.slice(9) ||
        "test-results/point-selection"
);
const label =
    options.find((value) => value.startsWith("--label="))?.slice(8) ||
    "Current source checkout";
const origin = process.env.CORE_TEST_SERVER || "http://127.0.0.1:8891";
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
    viewport: { width: 1120, height: 800 },
    recordVideo: { dir: output, size: { width: 1120, height: 800 } },
});
const page = await context.newPage();
/** @type {string[]} */
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

/**
 * @param {string} view
 * @param {"A" | "B"} id
 * @param {boolean} [shift]
 */
async function clickPoint(view, id, shift = false) {
    const point = await page.evaluate(
        async ({ view, id }) => {
            const { api } = await import("/tests/point-selection/index.js");
            const bounds = api.views.getLayoutBounds({ scope: [], view });
            const canvas = globalThis.document
                .querySelector("canvas")
                .getBoundingClientRect();
            const x = id === "A" ? 1 : 2;
            const y = id === "A" ? 1 : 2;
            return {
                x: canvas.x + bounds.x + (bounds.width * x) / 4,
                y: canvas.y + bounds.y + bounds.height * (1 - y / 3),
            };
        },
        { view, id }
    );
    await page.mouse.move(point.x, point.y, { steps: 16 });
    if (shift) await page.keyboard.down("Shift");
    await page.waitForTimeout(600);
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(800);
    await page.keyboard.up("Shift");
}

try {
    await page.goto(
        origin + "/tests/point-selection/?label=" + encodeURIComponent(label)
    );
    await page.getByText("Selected: none", { exact: true }).waitFor();
    await page.locator(".loading-indicator").waitFor({ state: "hidden" });
    await page.waitForTimeout(1400);
    await clickPoint("left", "A");
    assert.equal(await page.locator("#selection").innerText(), "Selected: A");
    await clickPoint("right", "B", true);
    const selected = await page.locator("#selection").innerText();
    const error = await page.locator("#error").innerText();
    if (expectFailure) {
        assert.equal(selected, "Selected: A");
        assert.match(error, /Cannot read properties of undefined.*data/);
        assert.equal(errors.length, 1);
    } else {
        assert.equal(selected, "Selected: A, B");
        assert.deepEqual(errors, []);
        await clickPoint("left", "A", true);
        assert.equal(
            await page.locator("#selection").innerText(),
            "Selected: B"
        );
    }
    await page.screenshot({ path: path.join(output, "result.png") });
    await fs.writeFile(
        path.join(output, "result.json"),
        JSON.stringify({ label, selected, error, errors }, null, 2) + "\n"
    );
    await page.waitForTimeout(3200);
} finally {
    const recording = page.video();
    await context.close();
    await recording.saveAs(path.join(output, "recording.webm"));
    await browser.close();
}
