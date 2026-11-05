import { Buffer } from "node:buffer";
/* global console, costScene, fetch, setTimeout */
import process from "node:process";
import { verifySources, verifyServers } from "./verifySources.mjs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { setup } from "./page.mjs";
const root = verifySources(process.argv[2]),
    require = createRequire(root + "/candidate/package.json"),
    { chromium } = require("playwright"),
    children = [],
    reports = [];
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
    for (const dpr of [1, 2])
        for (const scene of ["short", "stroked", "long", "spaced", "dense"]) {
            const rows = [],
                frames = [];
            for (const [kind, port] of [
                ["baseline", 4791],
                ["candidate", 4792],
            ]) {
                const page = await browser.newPage({ deviceScaleFactor: dpr });
                await page.goto("http://127.0.0.1:" + port);
                const r = await page.evaluate(setup, { kind, dpr, scene });
                if (r.validation) throw Error(r.validation);
                if (r.ink === 0) throw Error("empty frame " + scene);
                if (scene === "spaced" && r.glyphs !== r.labels * 2)
                    throw Error("space count");
                if (
                    scene === "dense" &&
                    Math.max(...r.firstGlyphX) - Math.min(...r.firstGlyphX) >
                        1e-6
                )
                    throw Error("not dense");
                frames.push(gunzipSync(Buffer.from(r.compressed, "base64")));
                delete r.compressed;
                rows.push(r);
                await page.evaluate(() => costScene.renderer.destroy());
                await page.close();
            }
            let maximum = 0,
                mismatch = 0,
                total = 0,
                inkPixels = 0;
            for (let i = 0; i < frames[0].length; i++) {
                const e = Math.abs(frames[0][i] - frames[1][i]);
                maximum = Math.max(maximum, e);
                total += e;
                if (e > 2) mismatch++;
                if (i % 4 === 3 && (frames[0][i] || frames[1][i])) inkPixels++;
            }
            const r = {
                dpr,
                scene,
                maximum,
                mismatch,
                mean: total / frames[0].length,
                inkPixels,
                ordinaryComparable: scene !== "stroked" && maximum <= 2,
                rows,
            };
            reports.push(r);
            console.log(JSON.stringify(r));
        }
    await writeFile(root + "/preflight.json", JSON.stringify(reports, null, 2));
} finally {
    await browser?.close();
    children.forEach((c) => c.kill());
}
