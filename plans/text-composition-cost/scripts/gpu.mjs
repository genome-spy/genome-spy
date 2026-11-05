/* global console, costScene, gpuSample, destroyGpuQueries, fetch, setTimeout */
import process from "node:process";
import { verifySources, verifyServers } from "./verifySources.mjs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { writeFile, readFile } from "node:fs/promises";
import { setup } from "./page.mjs";
import { timestamps, installGpu } from "./gpu-helpers.mjs";
const root = verifySources(process.argv[2]),
    require = createRequire(root + "/candidate/package.json"),
    { chromium } = require("playwright"),
    children = [],
    reports = [],
    metadata = [];
const compatibility = JSON.parse(
    await readFile(root + "/preflight.json", "utf8")
);
/** @param {number[]} a */
const stats = (a) => {
    const sorted = a.toSorted((a, b) => a - b);
    return {
        median: sorted[Math.floor(sorted.length * 0.5)],
        p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
        min: sorted[0],
        max: sorted.at(-1),
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
            const info = await p.evaluate(timestamps);
            metadata.push({ kind, dpr, ...info });
            if (!info.timestampQuery)
                throw Error("GPU timestamp query unavailable");
            pages[kind] = p;
        }
        for (const scene of ["short", "stroked", "long", "spaced", "dense"]) {
            const record = {
                dpr,
                scene,
                visual: compatibility.find(
                    (x) => x.dpr === dpr && x.scene === scene
                ),
                raw: { baseline: [], candidate: [] },
                validation: {},
            };
            for (const kind of ["baseline", "candidate"]) {
                await pages[kind].evaluate(setup, {
                    kind,
                    dpr,
                    scene,
                    captureFrame: false,
                });
                await pages[kind].evaluate(installGpu);
            }
            for (let i = 0; i < 45; i++)
                for (const kind of i % 2
                    ? ["candidate", "baseline"]
                    : ["baseline", "candidate"]) {
                    const r = await pages[kind].evaluate(
                        async () => await gpuSample()
                    );
                    if (r.draws.length !== 1)
                        throw Error("Unexpected draw count");
                    if (i >= 5) record.raw[kind].push(r);
                }
            record.summary = Object.fromEntries(
                Object.entries(record.raw).map(([kind, values]) => [
                    kind,
                    stats(values.map((x) => x.milliseconds)),
                ])
            );
            for (const kind of ["baseline", "candidate"]) {
                const error = await pages[kind].evaluate(async () => {
                    const e = await costScene.renderer.device.popErrorScope();
                    return e?.message ?? null;
                });
                record.validation[kind] = error;
                if (error) throw Error(error);
                await pages[kind].evaluate(() => destroyGpuQueries());
            }
            reports.push(record);
            await writeFile(
                root + "/gpu-results.json",
                JSON.stringify({ metadata, reports }, null, 2)
            );
            console.log(
                JSON.stringify({
                    scene,
                    dpr,
                    summary: record.summary,
                    draws: Object.fromEntries(
                        Object.entries(record.raw).map(([kind, values]) => [
                            kind,
                            values[0].draws,
                        ])
                    ),
                    validation: record.validation,
                    maximum: record.visual.maximum,
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
