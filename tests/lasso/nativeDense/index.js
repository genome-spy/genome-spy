import { embed } from "@genome-spy/core/minimal";
import "@genome-spy/core/rendering/webgpu/register.js";
import "@genome-spy/core/rendering/webgl.js";
import { parseUmap } from "../lassoUmapGpu/data.js";

const query = new URLSearchParams(location.search);
const status = document.getElementById("status");
if (query.has("density"))
    document.getElementById("instructions").textContent =
        "Shift-drag to select, scroll to zoom, double-click to clear. GPU membership updates while drawing; density colors show the locally selected fraction. Release reads selected IDs for CPU consumers. Escape cancels; zoom and pan resume after confirmation.";

async function start() {
    if (query.has("nonlinear") && !query.has("umap"))
        throw new Error(
            "The mixed log/sqrt fixture uses the positive-translated UMAP data."
        );
    /** @type {{x: number, y: number}[]} */
    let rows;
    if (query.has("umap")) {
        const response = await fetch("/private/lasso/allen-wmb.csv");
        if (!response.ok)
            throw new Error("Could not load the prepared UMAP file.");
        rows = parseUmap(await response.text());
    } else {
        const count = Number(query.get("points") ?? 1000000);
        if (!Number.isSafeInteger(count) || count < 1 || count > 10000000)
            throw new Error("Choose 1–10,000,000 points.");
        let seed = 42;
        const random = () => {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return seed / 4294967296;
        };
        rows = Array.from({ length: count }, (_, i) => {
            const cluster = i % 5;
            const radius = Math.sqrt(-2 * Math.log(1 - random()));
            const angle = random() * 2 * Math.PI;
            return {
                x: 0.15 + cluster * 0.17 + radius * Math.cos(angle) * 0.04,
                y:
                    0.5 +
                    Math.sin(cluster * 2) * 0.23 +
                    radius * Math.sin(angle) * 0.06,
            };
        });
    }
    const start = performance.now();
    const api = await embed(
        document.getElementById("plot"),
        {
            name: "dense",
            background: "white",
            width: { grow: 1 },
            height: { grow: 1 },
            datasets: { cells: rows },
            data: { name: "cells" },
            params: [
                {
                    name: "lasso",
                    select: {
                        type: "region",
                        ...(query.has("density") ? { preview: "density" } : {}),
                    },
                    persist: false,
                },
            ],
            mark: {
                type: "point",
                size: 2,
                opacity: 0.15,
                strokeWidth: 0,
                tooltip: null,
            },
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    axis: null,
                    scale: {
                        type: query.has("nonlinear") ? "log" : "linear",
                        zero: false,
                        zoom: true,
                        ...(query.has("umap") ? {} : { domain: [0, 1] }),
                    },
                },
                y: {
                    field: "y",
                    type: "quantitative",
                    axis: null,
                    scale: {
                        type: query.has("nonlinear") ? "sqrt" : "linear",
                        zero: false,
                        zoom: true,
                        ...(query.has("umap") ? {} : { domain: [0, 1] }),
                    },
                },
                color: {
                    condition: {
                        param: "lasso",
                        empty: false,
                        value: "#ff590d",
                    },
                    value: "#66758c",
                },
            },
        },
        { renderer: query.get("renderer") === "webgl" ? "webgl" : "webgpu" }
    );
    /** @type {any} */ (globalThis).__lassoDense = api;
    status.textContent = `Ready: ${rows.length.toLocaleString()} ${query.has("umap") ? "real cells" : "synthetic points"}. Setup ${(performance.now() - start).toFixed(0)} ms.`;
    window.addEventListener("pagehide", () => api.finalize(), { once: true });
}
void start().catch((error) => {
    status.textContent = error.message;
});
