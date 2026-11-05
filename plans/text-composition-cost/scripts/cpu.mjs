/* global console, costScene, cpuSample, costProfile, structuredClone, fetch, setTimeout */
import process from "node:process";
import { verifySources, verifyServers } from "./verifySources.mjs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { writeFile, readFile } from "node:fs/promises";
import { setup } from "./page.mjs";
import { install, profiler } from "./cpu-helpers.mjs";
const root = verifySources(process.argv[2]),
    require = createRequire(root + "/candidate/package.json"),
    { chromium } = require("playwright"),
    children = [],
    reports = [];
const compatibility = JSON.parse(
    await readFile(root + "/preflight.json", "utf8")
);
/** @param {number[]} a */
const stats = (a) => {
    const sorted = a.toSorted((a, b) => a - b);
    return {
        median: sorted[Math.floor(sorted.length * 0.5)],
        p95: sorted[
            Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)
        ],
    };
};
let browser;
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
    for (const dpr of [1, 2]) {
        const pages = {};
        for (const [kind, port] of [
            ["baseline", 4791],
            ["candidate", 4792],
        ]) {
            const p = await browser.newPage({ deviceScaleFactor: dpr });
            await p.goto("http://127.0.0.1:" + port);
            pages[kind] = p;
        }
        for (const scene of ["short", "stroked", "long", "spaced", "dense"]) {
            const record = {
                dpr,
                scene,
                visual: compatibility.find(
                    (x) => x.dpr === dpr && x.scene === scene
                ),
                timings: {},
                counts: {},
            };
            // Timing devices never opt into native-method instrumentation.
            for (const kind of ["baseline", "candidate"]) {
                await pages[kind].evaluate(profiler, false);
                await pages[kind].evaluate(setup, {
                    kind,
                    dpr,
                    scene,
                    captureFrame: false,
                });
                await pages[kind].evaluate(install);
            }
            for (const mode of [
                "create",
                "replace",
                "repaint",
                "layout",
                "lookup",
            ]) {
                const raw = { baseline: [], candidate: [] };
                for (let i = 0; i < 45; i++) {
                    for (const kind of i % 2
                        ? ["candidate", "baseline"]
                        : ["baseline", "candidate"]) {
                        if (mode === "lookup" && kind === "baseline") continue;
                        const r = await pages[kind].evaluate(
                            async ({ mode, phase }) => {
                                if (mode === "lookup" && !costScene.lastLayout)
                                    await cpuSample("layout", phase);
                                return await cpuSample(mode, phase);
                            },
                            { mode, phase: i % 2 }
                        );
                        if (i >= 5) raw[kind].push(r);
                    }
                }
                record.timings[mode] = {
                    raw,
                    summary: Object.fromEntries(
                        Object.entries(raw)
                            .filter(([, values]) => values.length)
                            .map(([kind, values]) => [
                                kind,
                                {
                                    cpu: stats(values.map((x) => x.cpu)),
                                    queue: stats(values.map((x) => x.queue)),
                                },
                            ])
                    ),
                };
            }
            record.validation = { timings: {}, counts: {} };
            for (const kind of ["baseline", "candidate"]) {
                const error = await pages[kind].evaluate(async () => {
                    const e = await costScene.renderer.device.popErrorScope();
                    return e?.message ?? null;
                });
                record.validation.timings[kind] = error;
                if (error) throw Error(error);
            }
            // Separate devices collect uploads/resources. These durations are never performance results.
            for (const kind of ["baseline", "candidate"]) {
                const page = pages[kind];
                await page.evaluate(profiler, true);
                await page.evaluate(setup, {
                    kind,
                    dpr,
                    scene,
                    captureFrame: false,
                });
                await page.evaluate(install);
                record.counts[kind] = {};
                for (const mode of ["create", "replace", "repaint"]) {
                    await page.evaluate(() => {
                        costProfile.counts = {};
                        costProfile.phases = {};
                    });
                    await page.evaluate(
                        async (mode) => await cpuSample(mode, 0),
                        mode
                    );
                    record.counts[kind][mode] = await page.evaluate(() =>
                        structuredClone(costProfile)
                    );
                }
            }
            for (const kind of ["baseline", "candidate"]) {
                const error = await pages[kind].evaluate(async () => {
                    const e = await costScene.renderer.device.popErrorScope();
                    return e?.message ?? null;
                });
                record.validation.counts[kind] = error;
                if (error) throw Error(error);
            }
            reports.push(record);
            await writeFile(
                root + "/cpu-results.json",
                JSON.stringify(reports, null, 2)
            );
            console.log(
                JSON.stringify({
                    scene,
                    dpr,
                    maximum: record.visual.maximum,
                    ordinaryComparable: record.visual.ordinaryComparable,
                    timings: Object.fromEntries(
                        Object.entries(record.timings).map(([mode, v]) => [
                            mode,
                            v.summary,
                        ])
                    ),
                    counts: record.counts,
                })
            );
        }
        for (const p of Object.values(pages)) {
            await p.evaluate(() => costScene.renderer.destroy());
            await p.close();
        }
    }
} finally {
    await browser?.close();
    children.forEach((c) => c.kill());
}
