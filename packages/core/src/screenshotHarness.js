import { embed, loadSpec } from "./index.js";
import {
    resolveCaptureDevicePixelRatio,
    resolveExportSize,
} from "./screenshotExport.js";

const DEFAULT_CONTAINER_WIDTH = 600;
const DEFAULT_CONTAINER_HEIGHT = 320;
const DEFAULT_LAZY_READY_TIMEOUT_MS = 30_000;
const READY_DELAY_MS = 100;

/**
 * @typedef {{
 *   status: string,
 *   detail: string,
 *   error: string,
 *   capture: () => Promise<{ logicalSize: { width: number, height: number }, dataUrl: string }>
 * }} ScreenshotState
 */

/**
 * @typedef {Window & typeof globalThis & { __genomeSpyScreenshot: ScreenshotState }} ScreenshotWindow
 */

const frameElement = /** @type {HTMLElement} */ (
    document.querySelector("#frame")
);
const specPathElement = /** @type {HTMLElement} */ (
    document.querySelector("#spec-path")
);
const statusElement = /** @type {HTMLElement} */ (
    document.querySelector("#status")
);
const screenshotWindow = /** @type {ScreenshotWindow} */ (window);

const query = new URLSearchParams(window.location.search);
const specUrl = query.get("spec");
const lazyReadyTimeoutMs = parseTimeoutMs(
    query.get("lazy-timeout-ms"),
    DEFAULT_LAZY_READY_TIMEOUT_MS
);

screenshotWindow.__genomeSpyScreenshot = {
    status: "booting",
    detail: "Booting screenshot harness",
    error: "",
    async capture() {
        throw new Error("Screenshot harness is not ready yet.");
    },
};

if (!specUrl) {
    setFailure("Missing required ?spec=... query parameter.");
} else {
    specPathElement.textContent = specUrl;
    frameElement.style.width = `${DEFAULT_CONTAINER_WIDTH}px`;
    frameElement.style.height = `${DEFAULT_CONTAINER_HEIGHT}px`;
    void initializeHarness(specUrl);
}

/**
 * @param {string} url
 */
async function initializeHarness(url) {
    try {
        setState("loading", "Loading spec…");
        await loadSpec(url);

        setState("embedding", "Embedding visualization…");
        const api = await embed(frameElement, url, {
            onError(error) {
                throw error;
            },
        });

        if (
            typeof api.getLogicalCanvasSize !== "function" ||
            typeof api.getRenderedBounds !== "function" ||
            typeof api.awaitVisibleLazyData !== "function"
        ) {
            throw new Error(
                "Embed did not return a usable GenomeSpy instance."
            );
        }

        setState("waitingForData", "Waiting for visible lazy data…");
        await waitForVisibleLazyData(api, lazyReadyTimeoutMs);

        setState("rendering", "Waiting for initial render…");
        await waitForSettledRender();

        const logicalSize = resolveExportSize(
            api.getRenderedBounds(),
            api.getLogicalCanvasSize()
        );
        const devicePixelRatio = resolveCaptureDevicePixelRatio(
            logicalSize.height
        );

        screenshotWindow.__genomeSpyScreenshot = {
            status: "ready",
            detail: `Ready (${logicalSize.width}x${logicalSize.height}, DPR ${formatDevicePixelRatio(
                devicePixelRatio
            )})`,
            error: "",
            async capture() {
                const currentSize = resolveExportSize(
                    api.getRenderedBounds(),
                    api.getLogicalCanvasSize()
                );
                const currentDevicePixelRatio = resolveCaptureDevicePixelRatio(
                    currentSize.height
                );
                return {
                    logicalSize: currentSize,
                    dataUrl: api.exportCanvas(
                        currentSize.width,
                        currentSize.height,
                        currentDevicePixelRatio,
                        "white"
                    ),
                };
            },
        };

        setStatus(
            `Ready (${logicalSize.width}x${logicalSize.height}, DPR ${formatDevicePixelRatio(
                devicePixelRatio
            )})`
        );
    } catch (error) {
        setFailure(error instanceof Error ? error.message : String(error));
    }
}

async function waitForSettledRender() {
    await waitForAnimationFrame();
    await waitForAnimationFrame();
    await wait(READY_DELAY_MS);
}

/**
 * @param {{
 *   awaitVisibleLazyData: (signal?: AbortSignal) => Promise<void>
 * }} api
 * @param {number} timeoutMs
 */
async function waitForVisibleLazyData(api, timeoutMs) {
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutMs);

    try {
        await api.awaitVisibleLazyData(controller.signal);
    } catch (error) {
        if (timedOut) {
            throw new Error(
                `Timed out after ${timeoutMs} ms while waiting for visible lazy data.`,
                { cause: error }
            );
        }

        throw error;
    } finally {
        window.clearTimeout(timeoutId);
    }
}

function waitForAnimationFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * @param {number} milliseconds
 */
function wait(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

/**
 * @param {string | null} value
 * @param {number} fallback
 */
function parseTimeoutMs(value, fallback) {
    if (value == null) {
        return fallback;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(
            `Invalid lazy-data timeout value: ${value}. Expected a positive number.`
        );
    }

    return parsed;
}

/**
 * @param {number} value
 */
function formatDevicePixelRatio(value) {
    return value.toFixed(3).replace(/\.?0+$/, "");
}

/**
 * @param {string} message
 */
function setStatus(message) {
    statusElement.textContent = message;
}

/**
 * @param {string} status
 * @param {string} detail
 */
function setState(status, detail) {
    screenshotWindow.__genomeSpyScreenshot = {
        ...screenshotWindow.__genomeSpyScreenshot,
        status,
        detail,
    };
    setStatus(detail);
}

/**
 * @param {string} message
 */
function setFailure(message) {
    screenshotWindow.__genomeSpyScreenshot = {
        status: "error",
        detail: message,
        error: message,
        async capture() {
            throw new Error(message);
        },
    };
    statusElement.textContent = message;
    statusElement.style.color = "#a03018";
}
