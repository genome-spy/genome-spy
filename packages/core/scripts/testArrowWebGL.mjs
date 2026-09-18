/* global console, document, fetch, process, requestAnimationFrame, setTimeout */

import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const packageDir = path.resolve(path.dirname(scriptPath), "..");
const serverOrigin = "http://127.0.0.1:4174";
const healthCheckPath = "/__health";
const devicePixelRatios = [1, 2];

async function main() {
    const playwright = await loadPlaywright();
    const server = startDevServer();

    try {
        await waitForServer(server);
        const browser = await playwright.chromium.launch({
            args: [
                "--use-angle=swiftshader",
                "--use-gl=angle",
                "--enable-webgl",
                "--enable-unsafe-swiftshader",
                "--ignore-gpu-blocklist",
            ],
        });

        try {
            for (const deviceScaleFactor of devicePixelRatios) {
                await testDevicePixelRatio(browser, deviceScaleFactor);
            }
        } finally {
            await browser.close();
        }
    } finally {
        await stopServer(server);
    }

    console.log("WebGL bidirectional arrow picking passed at DPR 1 and 2.");
}

/**
 * @param {import("playwright").Browser} browser
 * @param {number} deviceScaleFactor
 */
async function testDevicePixelRatio(browser, deviceScaleFactor) {
    const context = await browser.newContext({
        deviceScaleFactor,
        viewport: { width: 320, height: 200 },
    });

    try {
        const page = await context.newPage();
        const browserErrors = [];
        page.on("console", (message) => {
            if (message.type() === "error") {
                browserErrors.push(message.text());
            }
        });
        page.on("pageerror", (error) => browserErrors.push(error.message));

        await page.goto(`${serverOrigin}/screenshot.html`);
        const result = await page.evaluate(async () => {
            const { embed } = await import("/index.js");
            document.body.replaceChildren();
            document.body.style.margin = "0";
            document.body.style.display = "block";

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
                    data: { values: [{ id: "bidirectional" }] },
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
                        x: {
                            value: 0.2,
                            scale: { domain: [0, 1] },
                        },
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
                requestAnimationFrame(() => requestAnimationFrame(resolve))
            );

            const marks = api.views.root().marks;
            const probe = async (x, y) => (await marks.pick({ x, y })).status;
            const probes = {
                startHead: await probe(24, 50),
                stem: await probe(100, 50),
                endHead: await probe(176, 50),
                emptyCorner: await probe(24, 24),
            };
            const logicalSize = api.getLogicalCanvasSize();

            api.finalize();
            return { logicalSize, probes };
        });

        if (browserErrors.length) {
            throw new Error(browserErrors.join("\n"));
        }

        assertEqual(result.logicalSize.width, 200, "logical canvas width");
        assertEqual(result.logicalSize.height, 100, "logical canvas height");
        assertEqual(result.probes.startHead, "hit", "start head pick");
        assertEqual(result.probes.stem, "hit", "stem pick");
        assertEqual(result.probes.endHead, "hit", "end head pick");
        assertEqual(result.probes.emptyCorner, "empty", "empty corner pick");
    } finally {
        await context.close();
    }
}

/**
 * @param {unknown} actual
 * @param {unknown} expected
 * @param {string} label
 */
function assertEqual(actual, expected, label) {
    if (actual !== expected) {
        throw new Error(
            `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
        );
    }
}

function startDevServer() {
    const child = spawn("node", ["dev-server.mjs"], {
        cwd: packageDir,
        env: { ...process.env, PORT: new URL(serverOrigin).port },
        stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => process.stdout.write(chunk));
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    return child;
}

/** @param {ReturnType<typeof startDevServer>} child */
async function stopServer(child) {
    if (child.exitCode !== null) {
        return;
    }

    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
}

/** @param {ReturnType<typeof startDevServer>} child */
async function waitForServer(child) {
    const url = new URL(healthCheckPath, serverOrigin);
    const deadline = Date.now() + 15_000;

    while (Date.now() < deadline) {
        if (child.exitCode !== null) {
            throw new Error(
                `Core dev server exited before becoming ready (exit code ${child.exitCode}).`
            );
        }

        try {
            if ((await fetch(url)).ok) {
                return;
            }
        } catch {
            // Server not ready yet.
        }

        await new Promise((resolve) => setTimeout(resolve, 250));
    }

    throw new Error(`Timed out while waiting for ${url.toString()}`);
}

async function loadPlaywright() {
    try {
        return await import("playwright");
    } catch {
        throw new Error(
            'The WebGL arrow browser test requires the "playwright" package.'
        );
    }
}

if (path.resolve(process.argv[1] ?? "") === scriptPath) {
    await main().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}
