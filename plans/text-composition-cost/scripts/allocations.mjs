/* global console, costScene, fetch, setTimeout */
import process from "node:process";
import { verifySources, verifyServers } from "./verifySources.mjs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { setup } from "./page.mjs";
const root = verifySources(process.argv[2]),
    require = createRequire(root + "/candidate/package.json"),
    { chromium } = require("playwright"),
    children = [],
    reports = [];
let browser;
/** @param {number} n */
async function replacements(n) {
    const s = costScene;
    for (let i = 0; i < n; i++) {
        s.mark.series.replace({
            text: s.strings[i % 2],
            x: s.x,
            y: s.y,
            uniqueId: s.ids,
        });
        await s.renderer.device.queue.onSubmittedWorkDone();
    }
}
/** @param {any} node @param {Record<string, number>} files */
function summarize(node, files = {}) {
    const url = node.callFrame.url || "(native/host)",
        name = url.split("/").at(-1);
    files[name] = (files[name] ?? 0) + node.selfSize;
    for (const child of node.children ?? []) summarize(child, files);
    return files;
}
try {
    for (const [kind, port] of [
        ["baseline", 4791],
        ["candidate", 4792],
    ])
        children.push(
            spawn(
                process.execPath,
                ["tests/webgpuServer.js", "--port", String(port)],
                {
                    cwd: root + "/" + kind + "/packages/webgpu-renderer",
                    stdio: "ignore",
                }
            )
        );
    for (const port of [4791, 4792]) {
        let ready = false;
        for (let i = 0; i < 60; i++) {
            try {
                if ((await fetch("http://127.0.0.1:" + port)).ok) {
                    ready = true;
                    break;
                }
            } catch {
                // The local proof server may still be starting.
            }
            await new Promise((r) => setTimeout(r, 100));
        }
        if (!ready) throw Error("server " + port);
    }
    await verifyServers(root, children);
    browser = await chromium.launch({
        channel: "chrome",
        args: [
            "--enable-unsafe-webgpu",
            "--ignore-gpu-blocklist",
            ...(process.platform === "darwin" ? ["--use-angle=metal"] : []),
        ],
    });
    for (const dpr of [1, 2])
        for (const scene of ["short", "stroked", "long", "spaced", "dense"]) {
            for (const [kind, port] of dpr % 2
                ? [
                      ["baseline", 4791],
                      ["candidate", 4792],
                  ]
                : [
                      ["candidate", 4792],
                      ["baseline", 4791],
                  ]) {
                const page = await browser.newPage({ deviceScaleFactor: dpr });
                await page.goto("http://127.0.0.1:" + port);
                await page.evaluate(setup, {
                    kind,
                    dpr,
                    scene,
                    captureFrame: false,
                });
                await page.evaluate(replacements, 5);
                const cdp = await page.context().newCDPSession(page);
                await cdp.send("HeapProfiler.enable");
                await cdp.send("HeapProfiler.collectGarbage");
                const before = await cdp.send("Runtime.getHeapUsage");
                const events = [];
                cdp.on("Tracing.dataCollected", (e) => events.push(...e.value));
                const complete = new Promise((resolve) =>
                    cdp.once("Tracing.tracingComplete", resolve)
                );
                await cdp.send("Tracing.start", {
                    categories: "v8,devtools.timeline",
                    transferMode: "ReportEvents",
                });
                await cdp.send("HeapProfiler.startSampling", {
                    samplingInterval: 4096,
                    includeObjectsCollectedByMajorGC: true,
                    includeObjectsCollectedByMinorGC: true,
                });
                await page.evaluate(replacements, 20);
                const { profile } = await cdp.send("HeapProfiler.stopSampling");
                const afterWork = await cdp.send("Runtime.getHeapUsage");
                await cdp.send("Tracing.end");
                await complete;
                const gc = events.filter(
                    (e) =>
                        e.ph === "X" && ["MinorGC", "MajorGC"].includes(e.name)
                );
                await cdp.send("HeapProfiler.collectGarbage");
                const afterGC = await cdp.send("Runtime.getHeapUsage");
                const validation = await page.evaluate(async () => {
                    const e = await costScene.renderer.device.popErrorScope();
                    return e?.message ?? null;
                });
                if (validation) throw Error(validation);
                const bySource = summarize(profile.head),
                    estimatedBytes = Object.values(bySource).reduce(
                        (a, b) => a + b,
                        0
                    ),
                    record = {
                        kind,
                        scene,
                        dpr,
                        iterations: 20,
                        validation,
                        samplingInterval: 4096,
                        estimatedBytes,
                        bySource,
                        before,
                        afterWork,
                        afterGC,
                        gc: {
                            events: gc.length,
                            milliseconds: gc.reduce(
                                (a, e) => a + (e.dur ?? 0) / 1000,
                                0
                            ),
                            names: gc.map((e) => e.name),
                        },
                        browser: browser.version(),
                    };
                reports.push(record);
                await writeFile(
                    root + "/allocation-results.json",
                    JSON.stringify(reports, null, 2)
                );
                await writeFile(
                    root + `/allocation-${kind}-${scene}-${dpr}.json.gz`,
                    gzipSync(JSON.stringify({ profile, gc, record }))
                );
                console.log(JSON.stringify(record));
                await page.evaluate(() => costScene.renderer.destroy());
                await cdp.detach();
                await page.close();
            }
        }
} finally {
    await browser?.close();
    children.forEach((c) => c.kill());
}
