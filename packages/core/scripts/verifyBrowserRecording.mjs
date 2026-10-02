/* global console, document, window, Blob, URL, setTimeout, clearTimeout */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

// Exercise built artifacts, not Vite's source-module graph. Run Core's build first.
const bundleDir = path.resolve("dist/bundle");
for (const file of [
    "index.js",
    "index.es.js",
    "controls.js",
    "controls.es.js",
    "recording.js",
    "recording.es.js",
]) {
    const code = await fs.readFile(path.join(bundleDir, file), "utf8");
    if (!file.startsWith("recording")) {
        assert(
            !code.includes("MediaRecorder"),
            file + " unexpectedly includes recording"
        );
    }
}

const server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname === "/") {
        response.setHeader("Content-Type", "text/html");
        response.end('<div id="plot" style="width:600px;height:350px"></div>');
        return;
    }
    const file = path.resolve(bundleDir, "." + pathname);
    if (!file.startsWith(bundleDir + path.sep)) {
        response.writeHead(404).end();
        return;
    }
    try {
        const content = await fs.readFile(file);
        response.setHeader(
            "Content-Type",
            file.endsWith(".js")
                ? "text/javascript"
                : "application/octet-stream"
        );
        response.end(content);
    } catch {
        response.writeHead(404).end();
    }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin =
    "http://127.0.0.1:" +
    /** @type {import("node:net").AddressInfo} */ (server.address()).port;
let browser;
try {
    browser = await chromium.launch({
        channel: process.env.CHROME_CHANNEL,
        args: process.platform === "darwin" ? ["--use-angle=metal"] : [],
    });
    for (const format of ["es", "umd"]) {
        for (const renderer of ["webgl", "canvas"]) {
            const page = await browser.newPage();
            /** @type {string[]} */
            const requests = [];
            /** @type {string[]} */
            const errors = [];
            page.on("request", (request) => requests.push(request.url()));
            page.on("pageerror", (error) => errors.push(error.message));
            await page.goto(origin);
            if (format === "umd") {
                await page.addScriptTag({ url: origin + "/index.js" });
            }
            await page.evaluate(
                async ({ format, renderer }) => {
                    const core =
                        format === "es"
                            ? await import("/index.es.js")
                            : window.genomeSpyEmbed;
                    window.testApi = await core.embed(
                        document.getElementById("plot"),
                        {
                            width: "container",
                            height: "container",
                            data: { name: "frames" },
                            datasets: { frames: [{ color: "red" }] },
                            mark: { type: "rect", fillOpacity: 1 },
                            encoding: {
                                x: { value: 0.1 },
                                x2: { value: 0.9 },
                                y: { value: 0.1 },
                                y2: { value: 0.9 },
                                fill: {
                                    field: "color",
                                    legend: null,
                                    type: "nominal",
                                    scale: {
                                        domain: [
                                            "red",
                                            "lime",
                                            "blue",
                                            "yellow",
                                        ],
                                        range: [
                                            "red",
                                            "lime",
                                            "blue",
                                            "yellow",
                                        ],
                                    },
                                },
                            },
                        },
                        { renderer }
                    );
                },
                { format, renderer }
            );
            assert(
                !requests.some((url) =>
                    /\/(recording|controls)(\.es)?\.js/.test(url)
                ),
                "Core fetched an optional add-on"
            );

            // Load add-ons after embedding, so a duplicated per-bundle registry fails.
            if (format === "umd") {
                await page.addScriptTag({ url: origin + "/controls.js" });
                await page.addScriptTag({ url: origin + "/recording.js" });
            }
            await page.evaluate(async (format) => {
                const controls =
                    format === "es"
                        ? await import("/controls.es.js")
                        : window.genomeSpyControls;
                const recording =
                    format === "es"
                        ? await import("/recording.es.js")
                        : window.genomeSpyRecording;
                window.recordingAddon = recording;
                window.testControls = controls.attachControls(
                    document.getElementById("plot"),
                    window.testApi,
                    {
                        controls: [recording.recordButton()],
                        visibility: "always",
                    }
                );
            }, format);
            await page
                .getByRole("button", { name: "Record", exact: true })
                .click();
            await page.waitForTimeout(600);
            await page.evaluate(() =>
                window.testApi.datasets.set("frames", [{ color: "lime" }])
            );
            await page.waitForTimeout(600);
            await page
                .getByRole("button", { name: "Pause recording", exact: true })
                .click();
            const stop = page.getByRole("button", {
                name: "Stop recording",
                exact: true,
            });
            const pausedText = await stop.innerText();
            await page.evaluate(() =>
                window.testApi.datasets.set("frames", [{ color: "blue" }])
            );
            await page.waitForTimeout(1500);
            assert.equal(await stop.innerText(), pausedText);
            await page.evaluate(() =>
                window.testApi.datasets.set("frames", [{ color: "yellow" }])
            );
            await page
                .getByRole("button", { name: "Resume recording", exact: true })
                .click();
            await page.waitForTimeout(600);
            const downloading = page.waitForEvent("download");
            await stop.click();
            const download = await downloading;
            assert.equal(download.suggestedFilename(), "genomespy.webm");
            const bytes = await fs.readFile(await download.path());
            assert(bytes.length > 0);
            const { duration, colors } = await page.evaluate(async (bytes) => {
                const video = document.createElement("video");
                video.muted = true;
                const url = URL.createObjectURL(
                    new Blob([new Uint8Array(bytes)], { type: "video/webm" })
                );
                video.src = url;
                // Sample the mark at the center of decoded frames, tolerating lossy encoding.
                const sample = document.createElement("canvas");
                sample.width = sample.height = 1;
                const context = sample.getContext("2d", {
                    willReadFrequently: true,
                });
                const colors = new Set();
                function inspectFrame() {
                    context.drawImage(
                        video,
                        video.videoWidth / 2,
                        video.videoHeight / 2,
                        1,
                        1,
                        0,
                        0,
                        1,
                        1
                    );
                    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
                    if (r > 180 && g < 80 && b < 80) colors.add("red");
                    if (g > 180 && r < 80 && b < 80) colors.add("green");
                    if (b > 180 && r < 80 && g < 80) colors.add("blue");
                    if (r > 180 && g > 180 && b < 80) colors.add("yellow");
                    video.requestVideoFrameCallback(inspectFrame);
                }
                video.requestVideoFrameCallback(inspectFrame);
                let timeout;
                const ended = new Promise((resolve, reject) => {
                    timeout = setTimeout(
                        () => reject(new Error("Video playback timed out")),
                        10000
                    );
                    video.onended = resolve;
                    video.onerror = () =>
                        reject(new Error("Recorded video failed to decode"));
                });
                try {
                    await video.play();
                    await ended;
                    return {
                        duration: video.duration,
                        colors: Array.from(colors),
                    };
                } finally {
                    clearTimeout(timeout);
                    video.pause();
                    URL.revokeObjectURL(url);
                }
            }, Array.from(bytes));
            assert.deepEqual(
                colors.sort(),
                ["green", "red", "yellow"],
                "Video must include active changes and exclude the paused blue frame"
            );
            assert(
                duration > 1.2 && duration < 3,
                "Paused time leaked into the clip: " + duration
            );
            const cancellation = await page.evaluate(async () => {
                const discarded = window.recordingAddon.startRecording(
                    window.testApi
                );
                discarded.cancel();
                const session = window.recordingAddon.startRecording(
                    window.testApi
                );
                window.testControls.dispose();
                window.testApi.finalize();
                try {
                    await session.finished;
                } catch (error) {
                    return error.name;
                }
                return "not cancelled";
            });
            assert.equal(cancellation, "AbortError");
            assert.deepEqual(errors, []);
            console.log(
                `${format}/${renderer}: optional loading, controls, pause/resume, video pixels and disposal passed (${duration.toFixed(3)} s)`
            );
            await page.close();
        }
    }
} finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
}
