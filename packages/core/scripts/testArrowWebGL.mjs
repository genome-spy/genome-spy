/* global console, document, requestAnimationFrame */

import {
    loadPlaywright,
    startDevServer,
    stopServer,
    waitForServer,
} from "./captureScreenshots.mjs";

const serverOrigin = "http://127.0.0.1:4174";
const expectedPicks = ["hit", "hit", "hit", "empty"];
const server = await startDevServer(serverOrigin);

try {
    await waitForServer(serverOrigin, server);
    const { chromium } = await loadPlaywright();
    const browser = await chromium.launch({
        args: [
            "--use-angle=swiftshader",
            "--use-gl=angle",
            "--enable-webgl",
            "--enable-unsafe-swiftshader",
            "--ignore-gpu-blocklist",
        ],
    });

    try {
        for (const deviceScaleFactor of [1, 2]) {
            const context = await browser.newContext({
                deviceScaleFactor,
                viewport: { width: 320, height: 200 },
            });
            const page = await context.newPage();

            try {
                await page.goto(`${serverOrigin}/screenshot.html`);
                const picks = await page.evaluate(async () => {
                    const { embed } = await import("/index.js");
                    document.body.replaceChildren();

                    const host = document.createElement("div");
                    host.style.width = "200px";
                    host.style.height = "100px";
                    document.body.append(host);

                    const api = await embed(
                        host,
                        {
                            width: 200,
                            height: 100,
                            padding: 0,
                            data: { values: [{}] },
                            mark: {
                                type: "arrow",
                                direction: "both",
                                headPlacement: "outside",
                                headWidth: 2,
                                minStemLength: 118,
                                size: 20,
                                startNotch: true,
                                tooltip: false,
                            },
                            encoding: {
                                x: { value: 0.2 },
                                x2: { value: 0.8 },
                                y: { value: 0.5 },
                            },
                        },
                        {
                            renderer: "webgl",
                            onError(error) {
                                throw error;
                            },
                        }
                    );

                    await new Promise((resolve) =>
                        requestAnimationFrame(() =>
                            requestAnimationFrame(resolve)
                        )
                    );

                    const marks = api.views.root().marks;
                    const points = [
                        [24, 50],
                        [100, 50],
                        [176, 50],
                        [24, 24],
                    ];
                    const results = [];
                    for (const [x, y] of points) {
                        results.push((await marks.pick({ x, y })).status);
                    }
                    api.finalize();
                    return results;
                });

                if (JSON.stringify(picks) !== JSON.stringify(expectedPicks)) {
                    throw new Error(
                        `DPR ${deviceScaleFactor}: expected ${expectedPicks}, got ${picks}`
                    );
                }
            } finally {
                await context.close();
            }
        }
    } finally {
        await browser.close();
    }
} finally {
    await stopServer(server);
}

console.log("WebGL bidirectional arrow picking passed at DPR 1 and 2.");
