import runLassoScene from "../../../packages/webgpu-renderer/examples/lassoScene.js";
import { parseUmap, projectUmap, compareSelection } from "./data.js";

const canvas = document.querySelector("canvas");
const status = document.getElementById("status");
const comparison = document.getElementById("comparison");
const xScale = /** @type {HTMLSelectElement} */ (
    document.getElementById("xScale")
);
const yScale = /** @type {HTMLSelectElement} */ (
    document.getElementById("yScale")
);
const compare = /** @type {HTMLButtonElement} */ (
    document.getElementById("compare")
);
let cleanup = () => {};
let disposed = false;
/** @type {{polygon: ReadonlyArray<readonly [number,number]>, ids: Uint32Array, scales: ReturnType<typeof projectUmap>["scales"]} | undefined} */
let latest;

function resetComparison() {
    latest = undefined;
    compare.disabled = true;
    comparison.textContent = "Draw a selection to enable comparison.";
}
canvas.addEventListener("pointerdown", (event) => {
    if (event.button === 0 && !event.ctrlKey) resetComparison();
});
canvas.addEventListener("pointercancel", resetComparison);
window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") resetComparison();
});
window.addEventListener(
    "pagehide",
    () => {
        disposed = true;
        cleanup();
    },
    { once: true }
);

async function main() {
    const url = new URL("../private/lasso/allen-wmb.csv", window.location.href);
    const [response, metadataResponse] = await Promise.all([
        fetch(url),
        fetch(new URL("../private/lasso/allen-wmb.json", window.location.href)),
    ]);
    if (
        !response.ok ||
        !response.headers.get("content-type")?.includes("csv") ||
        !metadataResponse.ok
    )
        throw new Error(
            "Prepare the real data first: python3 tests/lasso/prepareData.py"
        );
    const text = await response.text();
    if (disposed) return;
    const rows = parseUmap(text);
    const metadata = await metadataResponse.json();
    if (rows.length <= 1_000_000 || rows.length !== metadata.cells)
        throw new Error(
            "Prepare more than one million cells and matching provenance metadata."
        );
    if (disposed) return;

    async function show() {
        xScale.disabled = yScale.disabled = true;
        resetComparison();
        cleanup();
        cleanup = () => {};
        status.textContent = `Projecting ${rows.length.toLocaleString()} real cells…`;
        const projected = projectUmap(
            rows,
            /** @type {import("./data.js").ScaleType} */ (xScale.value),
            /** @type {import("./data.js").ScaleType} */ (yScale.value)
        );
        const finished = await runLassoScene(canvas, {
            data: projected.data,
            onStatus: (value) => {
                status.textContent = value;
            },
            onSelection: (selection) => {
                latest = { ...selection, scales: projected.scales };
                compare.disabled = false;
                comparison.textContent = `GPU committed ${selection.ids.length.toLocaleString()} IDs. CPU comparison is available.`;
            },
        });
        if (disposed) finished();
        else {
            cleanup = finished;
            xScale.disabled = yScale.disabled = false;
        }
    }
    /** @param {unknown} error */
    const fail = (error) => {
        status.textContent =
            error instanceof Error ? error.message : String(error);
    };
    xScale.onchange = yScale.onchange = () => {
        void show().catch(fail);
    };
    compare.onclick = async () => {
        if (!latest) throw new Error("No committed selection to compare.");
        const selection = latest;
        xScale.disabled = yScale.disabled = compare.disabled = true;
        comparison.textContent = "Comparing IDs with the f64 CPU reference…";
        try {
            await new Promise((resolve) => requestAnimationFrame(resolve));
            if (disposed || latest !== selection) return;
            const started = performance.now();
            const result = compareSelection(rows, selection.scales, selection);
            comparison.textContent = `CPU ${result.cpu.toLocaleString()}, GPU ${result.gpu.toLocaleString()}; missing ${result.missing.toLocaleString()}, extra ${result.extra.toLocaleString()}. CPU comparison: ${(performance.now() - started).toFixed(1)} ms.`;
        } catch (error) {
            comparison.textContent =
                error instanceof Error ? error.message : String(error);
        } finally {
            if (!disposed) {
                xScale.disabled = yScale.disabled = false;
                compare.disabled = !latest;
            }
        }
    };
    await show();
}
void main().catch((error) => {
    status.textContent = error instanceof Error ? error.message : String(error);
});
