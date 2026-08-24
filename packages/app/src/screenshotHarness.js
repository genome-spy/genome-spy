import { embed } from "./index.js";

const DEFAULT_READY_TIMEOUT_MS = 30_000;

/**
 * @typedef {{status: string, detail: string, error: string}} ScreenshotState
 * @typedef {Window & typeof globalThis & {
 *   __genomeSpyScreenshot: ScreenshotState,
 *   __genomeSpyAppHarness?: {api: import("@genome-spy/core/types/embedApi.js").EmbedResult}
 * }} ScreenshotWindow
 */

const screenshotWindow = /** @type {ScreenshotWindow} */ (window);
const frame = /** @type {HTMLElement} */ (document.querySelector("#frame"));
const statusElement = /** @type {HTMLElement} */ (
    document.querySelector("#status")
);
const query = new URLSearchParams(window.location.search);
const specUrl = query.get("spec");
const renderer =
    /** @type {"auto" | "webgl" | "canvas" | "webgpu" | null} */ (
        query.get("renderer")
    ) ?? "auto";
const timeoutMs = parseTimeoutMs(
    query.get("lazy-timeout-ms"),
    DEFAULT_READY_TIMEOUT_MS
);

setState("booting", "Booting App screenshot harness");

if (!specUrl) {
    setFailure("Missing required ?spec=... query parameter.");
} else {
    void initialize(specUrl);
}

/** @param {string} url */
async function initialize(url) {
    try {
        setState("embedding", "Launching GenomeSpy App…");
        const api = await embed(frame, url, {
            embedMode: "embedded",
            plugins: [],
            renderer,
        });
        screenshotWindow.__genomeSpyAppHarness = { api };

        if (
            typeof api.awaitVisibleLazyData !== "function" ||
            typeof api.debug?.getViewRoot !== "function"
        ) {
            throw new Error("App embed did not return a usable instance.");
        }

        setState("waitingForData", "Waiting for visible App data…");
        await waitForVisibleLazyData(api, timeoutMs);
        await waitForSettledRender();

        const canvas = frame.querySelector("canvas");
        if (!canvas) {
            throw new Error("App launch completed without a canvas.");
        }
        const rect = canvas.getBoundingClientRect();
        if (
            rect.width <= 0 ||
            rect.height <= 0 ||
            canvas.width <= 0 ||
            canvas.height <= 0
        ) {
            throw new Error("App canvas has no visible size.");
        }

        setState(
            "ready",
            `Ready (${rect.width}x${rect.height}, DPR ${window.devicePixelRatio})`
        );
    } catch (error) {
        setFailure(error instanceof Error ? error.message : String(error));
    }
}

/**
 * @param {{awaitVisibleLazyData: (signal?: AbortSignal) => Promise<void>}} api
 * @param {number} timeout
 */
async function waitForVisibleLazyData(api, timeout) {
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeout);
    try {
        await api.awaitVisibleLazyData(controller.signal);
    } catch (error) {
        if (timedOut) {
            throw new Error(
                `Timed out after ${timeout} ms while waiting for visible App data.`,
                { cause: error }
            );
        }
        throw error;
    } finally {
        window.clearTimeout(timeoutId);
    }
}

async function waitForSettledRender() {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));
}

/** @param {string | null} value @param {number} fallback */
function parseTimeoutMs(value, fallback) {
    if (value == null) {
        return fallback;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid readiness timeout: ${value}.`);
    }
    return parsed;
}

/** @param {string} status @param {string} detail */
function setState(status, detail) {
    screenshotWindow.__genomeSpyScreenshot = { status, detail, error: "" };
    statusElement.textContent = detail;
}

/** @param {string} message */
function setFailure(message) {
    screenshotWindow.__genomeSpyScreenshot = {
        status: "error",
        detail: message,
        error: message,
    };
    statusElement.textContent = message;
    statusElement.style.color = "#a03018";
}
