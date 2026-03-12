import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(packageDir, "..", "..");
const examplesDir = path.join(repoRoot, "examples");
const defaultServerOrigin = "http://127.0.0.1:4173";
const screenshotHarnessPath = "/screenshot.html";
const healthCheckPath = "/__health";
const defaultLazyDataTimeoutMs = 30_000;
const screenshotHarnessTimeoutPaddingMs = 60_000;

const excludedExamples = new Set([
    "examples/core/app/samples.json",
]);

const helpText = `Usage:
  node packages/core/scripts/captureScreenshots.mjs [examples/...json ...]
  node packages/core/scripts/captureScreenshots.mjs --all

Options:
  --all                 Capture all curated examples under examples/core and examples/docs.
  --server-url URL      Use an already running server instead of launching packages/core/dev-server.mjs.
  --timeout-ms NUMBER   Max time to wait for visible lazy data before failing the example.
  --overwrite           Overwrite existing sibling .png files.
  --help                Show this help text.

Notes:
  - Screenshots are written next to their source specs as sibling .png files.
  - The script excludes app-only examples for now.
  - Remote lazy-data examples require network access during capture.
  - Explicitly listed examples overwrite by default. Batch runs skip existing screenshots unless --overwrite is provided.
`;

async function main() {
    const options = parseArgs(process.argv.slice(2));

    if (options.help) {
        console.log(helpText);
        return;
    }

    const examplePaths =
        options.examplePaths.length > 0
            ? normalizeRequestedPaths(options.examplePaths)
            : collectCuratedExamplePaths();
    const overwrite = options.overwrite ?? options.examplePaths.length > 0;

    if (!examplePaths.length) {
        throw new Error("No example specs selected for screenshot capture.");
    }

    const playwright = await loadPlaywright();
    const server =
        options.serverUrl === undefined
            ? await startDevServer(defaultServerOrigin)
            : undefined;
    const serverOrigin = options.serverUrl ?? defaultServerOrigin;

    try {
        await waitForServer(serverOrigin, server);

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
            const page = await browser.newPage();
            let currentExamplePath = "";
            page.on("console", (message) => {
                const type = message.type();
                if (type === "error" || type === "warning") {
                    console.error(
                        `[${currentExamplePath}] [browser:${type}] ${message.text()}`
                    );
                }
            });
            page.on("response", (response) => {
                if (response.status() >= 400) {
                    console.error(
                        `[${currentExamplePath}] [browser:http ${response.status()}] ${response.url()}`
                    );
                }
            });
            page.on("pageerror", (error) => {
                console.error(
                    `[${currentExamplePath}] [browser:pageerror] ${error.message}`
                );
            });

            /** @type {{ examplePath: string, message: string }[]} */
            const failures = [];
            let writtenCount = 0;
            let skippedExistingCount = 0;
            for (const examplePath of examplePaths) {
                currentExamplePath = examplePath;
                try {
                    const result = await captureExample(
                        page,
                        serverOrigin,
                        examplePath,
                        options.timeoutMs,
                        overwrite
                    );
                    if (result === "written") {
                        writtenCount += 1;
                    } else if (result === "skipped") {
                        skippedExistingCount += 1;
                    }
                } catch (error) {
                    const message =
                        error instanceof Error ? error.message : String(error);
                    failures.push({ examplePath, message });
                    console.error(`[${examplePath}] ${message}`);
                }
            }

            if (!writtenCount && skippedExistingCount) {
                console.log(
                    "No screenshots were written because all selected outputs already exist. " +
                        "Use --overwrite to refresh them."
                );
            }

            if (failures.length) {
                console.error("\nScreenshot capture failures:");
                for (const failure of failures) {
                    console.error(
                        `- ${failure.examplePath}: ${failure.message}`
                    );
                }

                process.exitCode = 1;
            }
        } finally {
            await browser.close();
        }
    } finally {
        await stopServer(server);
    }
}

/**
 * @param {string[]} examplePaths
 */
function normalizeRequestedPaths(examplePaths) {
    return examplePaths
        .map((examplePath) => examplePath.replace(/\\/g, "/"))
        .map((examplePath) =>
            examplePath.startsWith("examples/") ? examplePath : `examples/${examplePath}`
        )
        .filter((examplePath) => {
            if (excludedExamples.has(examplePath)) {
                console.warn(`Skipping excluded example: ${examplePath}`);
                return false;
            }

            return true;
        })
        .map((examplePath) => {
            const absolutePath = path.join(repoRoot, examplePath);
            if (!fs.existsSync(absolutePath)) {
                throw new Error(`No such example spec: ${examplePath}`);
            }

            return examplePath;
        });
}

function collectCuratedExamplePaths() {
    /** @type {string[]} */
    const examplePaths = [];

    for (const group of ["core", "docs"]) {
        const groupDir = path.join(examplesDir, group);
        visit(groupDir, (absolutePath) => {
            const examplePath = path
                .relative(repoRoot, absolutePath)
                .split(path.sep)
                .join("/");
            if (!excludedExamples.has(examplePath)) {
                examplePaths.push(examplePath);
            }
        });
    }

    return examplePaths.sort();
}

/**
 * @param {string} dir
 * @param {(absolutePath: string) => void} visitor
 */
function visit(dir, visitor) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const absolutePath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            visit(absolutePath, visitor);
        } else if (entry.isFile() && entry.name.endsWith(".json")) {
            visitor(absolutePath);
        }
    }
}

/**
 * @param {import("playwright").Page} page
 * @param {string} serverOrigin
 * @param {string} examplePath
 * @param {number} timeoutMs
 * @param {boolean} overwrite
 * @returns {Promise<"written" | "skipped">}
 */
async function captureExample(
    page,
    serverOrigin,
    examplePath,
    timeoutMs,
    overwrite
) {
    const outputPath = getOutputPath(examplePath);
    if (!overwrite && fs.existsSync(outputPath)) {
        console.log(`Skipping existing ${examplePath}`);
        return "skipped";
    }

    const specUrl = `/${examplePath}`;
    const harnessUrl = new URL(screenshotHarnessPath, serverOrigin);
    harnessUrl.searchParams.set("spec", specUrl);
    harnessUrl.searchParams.set("lazy-timeout-ms", String(timeoutMs));

    console.log(`Capturing ${examplePath}`);
    await page.goto(harnessUrl.toString(), { waitUntil: "load" });
    try {
        await page.waitForFunction(
            () => {
                return (
                    window.__genomeSpyScreenshot?.status === "ready" ||
                    window.__genomeSpyScreenshot?.status === "error"
                );
            },
            {
                timeout: timeoutMs + screenshotHarnessTimeoutPaddingMs,
            }
        );
    } catch (error) {
        const debugState = await page.evaluate(() => {
            return {
                harnessState: window.__genomeSpyScreenshot ?? null,
                statusText:
                    document.querySelector("#status")?.textContent ?? null,
            };
        });
        throw new Error(
            `Screenshot harness timed out for ${examplePath}. ` +
                `State: ${JSON.stringify(debugState)}`
        );
    }

    const state = await page.evaluate(() => {
        return {
            status: window.__genomeSpyScreenshot.status,
            detail: window.__genomeSpyScreenshot.detail,
            error: window.__genomeSpyScreenshot.error,
        };
    });

    if (state.status !== "ready") {
        throw new Error(
            `Screenshot harness failed for ${examplePath}: ${
                state.error || state.detail
            }`
        );
    }

    const capture = await page.evaluate(async () => {
        return window.__genomeSpyScreenshot.capture();
    });

    fs.writeFileSync(outputPath, decodeDataUrl(capture.dataUrl));
    return "written";
}

/**
 * @param {string} examplePath
 */
function getOutputPath(examplePath) {
    return path.join(repoRoot, examplePath.replace(/\.json$/, ".png"));
}

/**
 * @param {string} dataUrl
 */
function decodeDataUrl(dataUrl) {
    const match = dataUrl.match(/^data:image\/png;base64,(.+)$/);
    if (!match) {
        throw new Error("Expected PNG data URL from screenshot harness.");
    }

    return Buffer.from(match[1], "base64");
}

/**
 * @param {string} serverOrigin
 */
async function startDevServer(serverOrigin) {
    const port = String(new URL(serverOrigin).port || "4173");
    const child = spawn("node", ["dev-server.mjs"], {
        cwd: packageDir,
        env: {
            ...process.env,
            PORT: port,
        },
        stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => {
        process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
        process.stderr.write(chunk);
    });

    return child;
}

/**
 * @param {ReturnType<typeof startDevServer> extends Promise<infer T> ? T : never} child
 */
async function stopServer(child) {
    if (!child || child.exitCode !== null) {
        return;
    }

    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
}

/**
 * @param {string} serverOrigin
 * @param {ReturnType<typeof startDevServer> extends Promise<infer T> ? T : undefined} child
 */
async function waitForServer(serverOrigin, child) {
    const url = new URL(healthCheckPath, serverOrigin);
    const deadline = Date.now() + 15_000;

    while (Date.now() < deadline) {
        if (child && child.exitCode !== null) {
            throw new Error(
                `Core dev server exited before becoming ready (exit code ${child.exitCode}).`
            );
        }

        try {
            const response = await fetch(url);
            if (response.ok) {
                return;
            }
        } catch {
            // Server not ready yet.
        }

        await wait(250);
    }

    throw new Error(`Timed out while waiting for ${url.toString()}`);
}

/**
 * @param {number} milliseconds
 */
function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function loadPlaywright() {
    try {
        return await import("playwright");
    } catch (error) {
        throw new Error(
            'Screenshot capture requires the "playwright" package to be installed. ' +
                "Install it in the workspace before running this script."
        );
    }
}

/**
 * @param {string[]} args
 */
function parseArgs(args) {
    const options = {
        help: false,
        examplePaths: [],
        serverUrl: undefined,
        timeoutMs: defaultLazyDataTimeoutMs,
        overwrite: undefined,
    };

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === "--help" || arg === "-h") {
            options.help = true;
        } else if (arg === "--all") {
            // `--all` is implicit when no positional paths are provided.
        } else if (arg === "--overwrite") {
            options.overwrite = true;
        } else if (arg === "--server-url") {
            const serverUrl = args[index + 1];
            if (!serverUrl) {
                throw new Error("Missing value for --server-url");
            }

            options.serverUrl = serverUrl;
            index += 1;
        } else if (arg === "--timeout-ms") {
            const timeoutMs = Number(args[index + 1]);
            if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
                throw new Error(
                    "Expected a positive numeric value for --timeout-ms"
                );
            }

            options.timeoutMs = timeoutMs;
            index += 1;
        } else if (arg.startsWith("--")) {
            throw new Error(`Unknown option: ${arg}`);
        } else {
            options.examplePaths.push(arg);
        }
    }

    return options;
}

await main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
