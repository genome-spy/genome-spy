import { fileURLToPath, URL } from "node:url";
import { expect, test } from "playwright/test";

const core = "/@fs" + fileURLToPath(new URL("../src/", import.meta.url));

for (const dpr of [1, 2]) {
    test(`WebGL reactive null rule paints at DPR ${dpr}`, async ({
        playwright,
        baseURL,
    }) => {
        const browser = await playwright.chromium.launch({
            args: [
                "--use-angle=swiftshader",
                "--enable-unsafe-swiftshader",
                `--force-device-scale-factor=${dpr}`,
            ],
        });
        const page = await browser.newPage({ deviceScaleFactor: dpr });
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        try {
            await page.route("**/rule-paint.html", (route) =>
                route.fulfill({
                    contentType: "text/html",
                    body: "<body style='margin:0'></body>",
                })
            );
            await page.goto(new URL("/rule-paint.html", baseURL).href);
            const frames = await page.evaluate(renderRulePaints, { core, dpr });
            expect(frames.map((frame) => frame.error)).toEqual([0, 0, 0, 0, 0]);
            expect(frames.map(({ red, blue }) => [red > 0, blue > 0])).toEqual([
                [true, false],
                [true, true],
                [false, true],
                [false, false],
                [true, false],
            ]);
            expect(errors).toEqual([]);
        } finally {
            await browser.close();
        }
    });
}

/** @param {{core: string, dpr: number}} options */
async function renderRulePaints({ core, dpr }) {
    const { embed } = await import(core + "minimal.js");
    await import(core + "rendering/registerWebGL.js");
    const spec = (fill, stroke) => ({
        width: 64,
        height: 32,
        padding: 0,
        config: { background: null },
        params: [
            { name: "fillPaint", value: "red" },
            { name: "strokePaint", value: null },
        ],
        data: { values: [{}] },
        mark: {
            type: "rule",
            size: 8,
            strokeWidth: 4,
            strokeAlign: "outside",
            fill,
            stroke,
        },
        encoding: {
            x: { value: 0.2 },
            x2: { value: 0.8 },
            y: { value: 0.5 },
        },
    });
    const host = globalThis.document.createElement("div");
    globalThis.document.body.append(host);
    const api = await embed(
        host,
        spec({ expr: "fillPaint" }, { expr: "strokePaint" }),
        {
            renderer: "webgl",
            onError: (error) => {
                throw error;
            },
        }
    );
    const read = async (api) => {
        const { blob } = await api.imageExport.raster({
            pixelRatio: dpr,
            background: null,
        });
        const bitmap = await globalThis.createImageBitmap(blob);
        const { width, height } = bitmap;
        if (width !== 64 * dpr || height !== 32 * dpr) {
            throw new Error("Unexpected raster backing size");
        }
        const canvas = new globalThis.OffscreenCanvas(width, height);
        const context = canvas.getContext("2d");
        context.drawImage(bitmap, 0, 0);
        bitmap.close();
        return context.getImageData(0, 0, width, height).data;
    };
    const frames = [];
    try {
        for (const [fill, stroke] of [
            ["red", null],
            ["red", "blue"],
            [null, "blue"],
            [null, null],
            ["red", null],
        ]) {
            api.params.get("fillPaint").setValue(fill);
            api.params.get("strokePaint").setValue(stroke);
            await new Promise((resolve) =>
                globalThis.requestAnimationFrame(() =>
                    globalThis.requestAnimationFrame(resolve)
                )
            );
            const referenceHost = globalThis.document.createElement("div");
            globalThis.document.body.append(referenceHost);
            // Explicit value definitions distinguish no paint from omitted properties.
            const referenceSpec = spec(fill, stroke);
            referenceSpec.encoding.fill = { value: fill };
            referenceSpec.encoding.stroke = { value: stroke };
            const reference = await embed(referenceHost, referenceSpec, {
                renderer: "webgl",
                onError: (error) => {
                    throw error;
                },
            });
            try {
                // Compare the real reactive path with equivalent static paints.
                const actual = await read(api),
                    expected = await read(reference);
                let error = 0,
                    red = 0,
                    blue = 0;
                for (let i = 0; i < actual.length; i++)
                    error = Math.max(error, Math.abs(actual[i] - expected[i]));
                for (let i = 0; i < actual.length; i += 4) {
                    if (actual[i + 3] && actual[i] > actual[i + 2]) red++;
                    if (actual[i + 3] && actual[i + 2] > actual[i]) blue++;
                }
                frames.push({ error, red, blue });
            } finally {
                reference.finalize();
                referenceHost.remove();
            }
        }
        return frames;
    } finally {
        api.finalize();
        host.remove();
    }
}
