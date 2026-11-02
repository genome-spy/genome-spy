import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * @typedef {object} DemoControls
 * @prop {import("playwright").Page} page
 * @prop {(x: number, y: number, durationMs?: number) => Promise<void>} moveTo
 * @prop {(text: string) => Promise<void>} caption Empty text hides the caption.
 */

/**
 * Record a prepared browser page. The caller owns the server and demo actions.
 * Resolve Playwright from the caller's project, keeping the helper portable.
 * @param {object} options
 * @param {string} options.url
 * @param {string} options.outputPath Use a new .webm path outside the repository.
 * @param {(controls: DemoControls) => Promise<void>} options.demonstrate
 * @param {(page: import("playwright").Page) => Promise<void>} [options.prepare]
 * @param {{width: number, height: number}} [options.viewport]
 * @param {import("playwright").LaunchOptions} [options.launchOptions]
 * @param {Omit<import("playwright").BrowserContextOptions, "viewport" | "recordVideo">} [options.contextOptions]
 * @param {boolean} [options.clickIndicators]
 */
export async function recordBrowserDemo({
    url,
    outputPath,
    demonstrate,
    prepare = async () => {},
    viewport = { width: 1000, height: 650 },
    launchOptions = {},
    contextOptions = {},
    clickIndicators = false,
}) {
    const videoPath = resolve(outputPath);
    if (extname(videoPath) !== ".webm" || existsSync(videoPath)) {
        throw new Error("Choose a new .webm output path: " + videoPath);
    }

    await run("ffmpeg", ["-version"]);
    await run("ffprobe", ["-version"]);
    const { chromium } = createRequire(join(process.cwd(), "package.json"))(
        "playwright"
    );
    await mkdir(dirname(videoPath), { recursive: true });
    const temporary = await mkdtemp(join(tmpdir(), "pr-demo-"));

    try {
        const browser = await chromium.launch(launchOptions);
        try {
            const context = await browser.newContext({
                ...contextOptions,
                viewport,
                recordVideo: { dir: temporary, size: viewport },
            });
            const begun = performance.now();
            const page = await context.newPage();
            await page.addInitScript(installOverlays, { clickIndicators });
            await page.goto(url);
            await prepare(page);
            await page.evaluate(
                () => new Promise((done) => requestAnimationFrame(done))
            );

            const startSeconds = (performance.now() - begun) / 1000;
            await demonstrate(createControls(page));
            const durationSeconds =
                (performance.now() - begun) / 1000 - startSeconds;
            const video = page.video();
            await context.close(); // Flush the recording before encoding it.

            await run("ffmpeg", [
                "-hide_banner",
                "-loglevel",
                "error",
                "-n",
                "-ss",
                String(startSeconds),
                "-i",
                await video.path(),
                "-t",
                String(durationSeconds),
                "-an",
                "-c:v",
                "libvpx-vp9",
                "-crf",
                "28",
                "-b:v",
                "0",
                "-deadline",
                "good",
                "-cpu-used",
                "3",
                "-row-mt",
                "1",
                videoPath,
            ]);
        } finally {
            await browser.close();
        }
    } finally {
        await rm(temporary, { recursive: true, force: true });
    }

    const { stdout } = await run("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        videoPath,
    ]);
    const durationSeconds = Number(JSON.parse(stdout).format.duration);
    const previewPaths = [];
    for (const [index, fraction] of [0.1, 0.5, 0.9].entries()) {
        const path = videoPath.slice(0, -5) + `-preview-${index + 1}.png`;
        await run("ffmpeg", [
            "-hide_banner",
            "-loglevel",
            "error",
            "-n",
            "-ss",
            String(durationSeconds * fraction),
            "-i",
            videoPath,
            "-frames:v",
            "1",
            path,
        ]);
        previewPaths.push(path);
    }

    return { videoPath, previewPaths, durationSeconds };
}

/** @param {import("playwright").Page} page @returns {DemoControls} */
function createControls(page) {
    let pointer = { x: 0, y: 0 };
    return {
        page,
        async moveTo(x, y, durationMs = 500) {
            const from = pointer;
            const steps = Math.max(1, Math.ceil(durationMs / 20));
            for (let step = 1; step <= steps; step++) {
                const t = step / steps;
                const eased = t * t * (3 - 2 * t);
                await page.mouse.move(
                    from.x + (x - from.x) * eased,
                    from.y + (y - from.y) * eased
                );
                await page.waitForTimeout(durationMs / steps);
            }
            pointer = { x, y };
        },
        async caption(text) {
            await page.locator("#pr-demo-caption").evaluate((element, text) => {
                element.textContent = text;
                element.toggleAttribute("hidden", !text);
            }, text);
        },
    };
}

/** Runs in each document, independently of the application being recorded.
 * @param {{clickIndicators: boolean}} options
 */
function installOverlays({ clickIndicators }) {
    const mount = () => {
        const overlay = document.createElement("div");
        overlay.style.cssText =
            "position:fixed;inset:0;pointer-events:none;z-index:2147483647";
        const cursor = document.createElement("div");
        cursor.id = "pr-demo-cursor";
        cursor.hidden = true;
        cursor.style.cssText =
            "position:absolute;left:0;top:0;width:24px;height:30px";
        cursor.innerHTML =
            '<svg width="24" height="30" viewBox="0 0 24 30"><path d="M2 2V23L7.5 17.5L12 27L16 25L11.5 15.5H20Z" fill="#111" stroke="white" stroke-width="1.5" stroke-linejoin="round"/></svg>';
        const caption = document.createElement("div");
        caption.id = "pr-demo-caption";
        caption.hidden = true;
        caption.style.cssText =
            "position:absolute;bottom:20px;left:20px;right:20px;padding:12px 16px;border:1px solid #dce4eb;border-radius:8px;background:#f5f8fbf5;color:#17232d;font:600 17px/1.5 system-ui,sans-serif;white-space:pre-line";
        overlay.append(cursor, caption);
        document.documentElement.append(overlay);

        document.addEventListener("mousemove", (event) => {
            cursor.hidden = false;
            cursor.style.transform = `translate(${event.clientX - 2}px,${event.clientY - 2}px)`;
        });
        if (clickIndicators) {
            document.addEventListener("mousedown", (event) => {
                const pulse = document.createElement("div");
                pulse.style.cssText = `position:absolute;left:${event.clientX - 12}px;top:${event.clientY - 12}px;width:20px;height:20px;border:2px solid #277cb5;border-radius:50%`;
                overlay.append(pulse);
                pulse
                    .animate(
                        [
                            { transform: "scale(0.7)", opacity: 1 },
                            { transform: "scale(2.1)", opacity: 0 },
                        ],
                        { duration: 500, easing: "ease-out" }
                    )
                    .finished.then(() => pulse.remove());
            });
        }
    };
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", mount, { once: true });
    } else {
        mount();
    }
}
