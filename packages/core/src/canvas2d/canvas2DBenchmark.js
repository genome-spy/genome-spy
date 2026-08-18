import { embed } from "../index.js";

/**
 * Runs the repeatable synchronous-redraw benchmark used by the Canvas2D plan.
 * This module is a development harness and is not imported by package entries.
 *
 * @param {object} options
 * @param {string} options.specUrl
 * @param {number} options.instanceCount
 * @param {number[]} options.fullDomain
 * @param {number[]} options.zoomDomain
 * @param {number} [options.warmups]
 * @param {number} [options.iterations]
 */
export async function runCanvas2DBenchmark({
    specUrl,
    instanceCount,
    fullDomain,
    zoomDomain,
    warmups = 20,
    iterations = 100,
}) {
    const response = await fetch(specUrl);
    if (!response.ok) {
        throw new Error(`Could not load benchmark spec: ${response.status}`);
    }
    const spec = await response.json();
    spec.data.sequence.stop = instanceCount;

    document.body.replaceChildren();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const api = await embed(host, spec, { renderer: "canvas" });

    try {
        const scale = api.getScaleResolutionByName("benchmark-x");
        if (!scale) {
            throw new Error('Benchmark scale "benchmark-x" was not found.');
        }

        for (let i = 0; i < warmups; i++) {
            await redraw(scale, i % 2 ? fullDomain : zoomDomain);
        }

        const durations = [];
        for (let i = 0; i < iterations; i++) {
            await redraw(scale, fullDomain);
            const start = performance.now();
            await redraw(scale, zoomDomain);
            durations.push(performance.now() - start);
        }
        durations.sort((a, b) => a - b);

        const canvas = host.querySelector("canvas");
        if (!canvas) {
            throw new Error("Canvas benchmark surface was not created.");
        }
        return {
            p50: percentile(durations, 0.5),
            p95: percentile(durations, 0.95),
            iterations,
            warmups,
            instanceCount,
            logicalSize: api.getLogicalCanvasSize(),
            backingSize: { width: canvas.width, height: canvas.height },
            devicePixelRatio: window.devicePixelRatio,
            userAgent: navigator.userAgent,
        };
    } finally {
        api.finalize();
    }
}

/**
 * @param {import("../types/scaleResolutionApi.js").ScaleResolutionApi} scale
 * @param {number[]} domain
 */
function redraw(scale, domain) {
    return scale.zoomTo(domain, { duration: 0, renderImmediately: true });
}

/** @param {number[]} sorted @param {number} quantile */
function percentile(sorted, quantile) {
    return sorted[Math.floor((sorted.length - 1) * quantile)];
}
