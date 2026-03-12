import { embed, loadSpec } from "./index.js";

const DEFAULT_CONTAINER_WIDTH = 600;
const DEFAULT_CONTAINER_HEIGHT = 400;
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
            typeof api.getRenderedBounds !== "function"
        ) {
            throw new Error(
                "Embed did not return a usable GenomeSpy instance."
            );
        }

        setState("rendering", "Waiting for initial render…");
        await waitForSettledRender();

        const logicalSize = resolveExportSize(
            api.getRenderedBounds(),
            api.getLogicalCanvasSize()
        );

        screenshotWindow.__genomeSpyScreenshot = {
            status: "ready",
            detail: `Ready (${logicalSize.width}x${logicalSize.height}, DPR 1)`,
            error: "",
            async capture() {
                const currentSize = resolveExportSize(
                    api.getRenderedBounds(),
                    api.getLogicalCanvasSize()
                );
                return {
                    logicalSize: currentSize,
                    dataUrl: api.exportCanvas(
                        currentSize.width,
                        currentSize.height,
                        1,
                        "white"
                    ),
                };
            },
        };

        setStatus(
            `Ready (${logicalSize.width}x${logicalSize.height}, DPR 1)`
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
 * @param {{ width: number | undefined, height: number | undefined }} renderedBounds
 * @param {{ width: number, height: number }} logicalSize
 */
function resolveExportSize(renderedBounds, logicalSize) {
    return {
        width:
            Number.isFinite(renderedBounds.width) && renderedBounds.width > 0
                ? Math.ceil(renderedBounds.width)
                : Number.isFinite(logicalSize.width) && logicalSize.width > 0
                  ? logicalSize.width
                  : DEFAULT_CONTAINER_WIDTH,
        height:
            Number.isFinite(renderedBounds.height) && renderedBounds.height > 0
                ? Math.ceil(renderedBounds.height)
                : Number.isFinite(logicalSize.height) && logicalSize.height > 0
                  ? logicalSize.height
                  : DEFAULT_CONTAINER_HEIGHT,
    };
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
