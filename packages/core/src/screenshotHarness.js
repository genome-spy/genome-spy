import { embed, loadSpec } from "./index.js";

const DEFAULT_CONTAINER_WIDTH = 600;
const DEFAULT_CONTAINER_HEIGHT = 400;
const READY_DELAY_MS = 100;

const frameElement = document.querySelector("#frame");
const specPathElement = document.querySelector("#spec-path");
const statusElement = document.querySelector("#status");

const query = new URLSearchParams(window.location.search);
const specUrl = query.get("spec");

window.__genomeSpyScreenshot = {
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
        const spec = await loadSpec(url);

        setState("embedding", "Embedding visualization…");
        const api = await embed(frameElement, spec);

        setState("rendering", "Waiting for initial render…");
        await waitForSettledRender();

        const logicalSize = sanitizeSize(api.getLogicalCanvasSize());

        window.__genomeSpyScreenshot = {
            status: "ready",
            detail: `Ready (${logicalSize.width}x${logicalSize.height}, DPR 1)`,
            error: "",
            async capture() {
                const currentSize = sanitizeSize(api.getLogicalCanvasSize());
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
 * @param {{ width: number, height: number }} size
 */
function sanitizeSize(size) {
    return {
        width:
            Number.isFinite(size.width) && size.width > 0
                ? size.width
                : DEFAULT_CONTAINER_WIDTH,
        height:
            Number.isFinite(size.height) && size.height > 0
                ? size.height
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
    window.__genomeSpyScreenshot = {
        ...window.__genomeSpyScreenshot,
        status,
        detail,
    };
    setStatus(detail);
}

/**
 * @param {string} message
 */
function setFailure(message) {
    window.__genomeSpyScreenshot = {
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
