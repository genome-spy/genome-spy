import { embed } from "@genome-spy/core/minimal";
import "@genome-spy/core/rendering/webgl.js";
import "@genome-spy/core/rendering/webgpu/register.js";
import "@genome-spy/core/rendering/canvas.js";
import "@genome-spy/core/rendering/svg.js";

const query = new URLSearchParams(location.search);
const status = document.getElementById("status");
const nonlinear = !query.has("linear");
/** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
const spec = {
    name: "points",
    ...(query.has("density") ? { background: "white" } : {}),
    width: { grow: 1 },
    height: { grow: 1 },
    params: [
        {
            name: "lasso",
            select: query.has("density")
                ? { type: "region", preview: "density" }
                : "region",
            persist: false,
        },
    ],
    data: {
        values: [
            { name: "A", x: 10, y: 16 },
            { name: "B", x: 10, y: 36 },
            { name: "C", x: 10, y: 25 },
        ],
    },
    mark: {
        type: "point",
        size: 140,
        tooltip: null,
        ...(query.has("density") ? { strokeWidth: 0 } : {}),
    },
    encoding: {
        x: {
            field: "x",
            type: "quantitative",
            axis: null,
            scale: {
                type: nonlinear ? "log" : "linear",
                domain: [1, 100],
                zero: false,
                zoom: query.has("zoom"),
            },
        },
        y: {
            field: "y",
            type: "quantitative",
            axis: null,
            scale: {
                type: nonlinear ? "sqrt" : "linear",
                domain: [0, 100],
                zoom: query.has("zoom"),
            },
        },
        color: {
            condition: {
                param: "lasso",
                empty: query.has("emptyTrue"),
                value: "#f97316",
            },
            value: "#64748b",
        },
    },
};
/** @type {import("@genome-spy/core/types/embedApi.js").EmbedOptions["renderer"]} */
const renderer = /** @type {any} */ (query.get("renderer") ?? "webgl");
const { name, params, data, ...points } = spec;
/** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
const linkedSpec = {
    ...(query.has("density") ? { background: "white" } : {}),
    params,
    datasets: { cells: /** @type {{ values: any[] }} */ (data).values },
    data: { name: "cells" },
    transform: [{ type: "identifier" }],
    resolve: { scale: { x: "independent", y: "independent" } },
    hconcat: [
        { name, ...points },
        {
            name: "linked",
            mark: spec.mark,
            width: { grow: 1 },
            height: { grow: 1 },
            encoding: {
                x: {
                    field: "y",
                    type: "quantitative",
                    axis: null,
                    scale: { domain: [0, 100], zoom: false },
                },
                y: {
                    field: "x",
                    type: "quantitative",
                    axis: null,
                    scale: { domain: [0, 100], zoom: false },
                },
                color: spec.encoding.color,
            },
        },
        {
            name: "filtered",
            ...points,
            transform: [{ type: "filter", param: "lasso", empty: false }],
        },
    ],
};
void embed(
    document.getElementById("plot"),
    query.has("linked") ? linkedSpec : spec,
    { renderer }
)
    .then((api) => {
        /** @type {any} */ (globalThis).__lassoNative = api;
        const selection = api.params.getSelection("lasso");
        selection.subscribe((value) => {
            const region =
                /** @type {import("@genome-spy/core/types/embedApi.js").RegionSnapshot} */ (
                    value
                );
            status.textContent = `${region.status}: ${region.data.map((row) => row.name).join(",")}`;
        });
        status.textContent = "Ready";
        window.addEventListener(
            "pagehide",
            () => {
                api.finalize();
            },
            {
                once: true,
            }
        );
    })
    .catch((error) => {
        status.textContent = error.message;
    });
