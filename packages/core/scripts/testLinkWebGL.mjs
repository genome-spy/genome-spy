/* global console, document, requestAnimationFrame */

import {
    loadPlaywright,
    startDevServer,
    stopServer,
    waitForServer,
} from "./captureScreenshots.mjs";

const serverOrigin = "http://127.0.0.1:4174";
const expectedPicks = ["hit", "hit", "hit", "hit", "empty"];
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
                    host.style.width = "100px";
                    host.style.height = "100px";
                    document.body.append(host);

                    const api = await embed(
                        host,
                        {
                            width: 100,
                            height: 100,
                            padding: 0,
                            data: { values: [{}] },
                            mark: {
                                type: "link",
                                linkShape: "orthogonal",
                                orient: "vertical",
                                size: 2,
                                opacity: 0.5,
                                minPickingSize: 8,
                                tooltip: false,
                            },
                            encoding: {
                                x: { value: 0.2 },
                                x2: { value: 0.8 },
                                y: { value: 0.2 },
                                y2: { value: 0.8 },
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
                        [20, 50],
                        [20, 20],
                        [50, 20],
                        [23, 50],
                        [50, 50],
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

console.log(
    "WebGL orthogonal link legs, elbow, and minimum-width picking passed at DPR 1 and 2."
);
