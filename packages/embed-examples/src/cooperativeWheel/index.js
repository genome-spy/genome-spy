import { embed } from "@genome-spy/core";
import { embed as embedApp } from "@genome-spy/app";

/** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
const chartSpec = {
    width: "container",
    height: 220,
    padding: 15,
    data: {
        values: Array.from({ length: 201 }, (_, i) => ({
            position: i * 5,
            signal: Math.sin(i / 9) * Math.cos(i / 37) + 1.2,
        })),
    },
    mark: { type: "point", color: "#3e8cb6", size: 16 },
    encoding: {
        x: {
            field: "position",
            type: "index",
            title: "Position",
            scale: { name: "chartX", domain: [0, 1000], zoom: true },
        },
        y: { field: "signal", type: "quantitative", title: "Signal" },
    },
};

const rowNames = Array.from(
    { length: 36 },
    (_, i) => "Track " + String(i + 1).padStart(2, "0")
);

/** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
const viewportSpec = {
    name: "viewportRows",
    width: "container",
    height: { step: 26 },
    viewportHeight: 230,
    padding: 15,
    data: {
        values: rowNames.flatMap((track, row) =>
            Array.from({ length: 5 }, (_, segment) => ({
                track,
                start: segment * 200 + ((row * 17) % 70),
                end: segment * 200 + 100 + ((row * 17) % 70),
                score: (row + segment) % 5,
            }))
        ),
    },
    mark: "rect",
    encoding: {
        x: {
            field: "start",
            type: "index",
            title: "Position",
            scale: { name: "viewportX", domain: [0, 1000], zoom: true },
        },
        x2: { field: "end" },
        y: {
            field: "track",
            type: "nominal",
            title: null,
            scale: { type: "band", domain: rowNames, padding: 0.3 },
        },
        color: {
            field: "score",
            type: "quantitative",
            scale: { domain: [0, 4], scheme: "blues" },
            legend: null,
        },
    },
};

const samples = Array.from({ length: 32 }, (_, i) => ({
    sample: "S" + String(i + 1).padStart(2, "0"),
    group: ["A", "B", "C", "D"][i % 4],
    response: ["Stable", "Partial", "Complete"][i % 3],
    purity: 0.35 + ((i * 13) % 60) / 100,
}));

/** @type {import("@genome-spy/app/spec/appSpec.js").AppRootSpec} */
const cohortSpec = {
    description: "Synthetic cohort",
    samples: {
        identity: { data: { values: samples } },
    },
    sampleLayout: { sampleHeight: 35 },
    metadata: {
        sources: [
            {
                backend: { backend: "data", data: { values: samples } },
                attributes: {
                    group: {
                        title: "Group",
                        type: "nominal",
                        scale: { domain: ["A", "B", "C", "D"] },
                    },
                    response: {
                        title: "Response",
                        type: "nominal",
                        scale: {
                            domain: ["Stable", "Partial", "Complete"],
                        },
                    },
                    purity: {
                        title: "Purity",
                        type: "quantitative",
                        scale: { domain: [0, 1], scheme: "blues" },
                    },
                },
            },
        ],
        titleReserve: true,
    },
    spec: {
        name: "cohortSegments",
        data: {
            values: samples.flatMap(({ sample }, row) =>
                Array.from({ length: 10 }, (_, segment) => ({
                    sample,
                    start: segment * 100,
                    end: (segment + 1) * 100,
                    state: ["neutral", "gain", "loss"][(row + segment) % 3],
                }))
            ),
        },
        mark: "rect",
        encoding: {
            sample: { field: "sample" },
            x: {
                field: "start",
                type: "index",
                title: "Position",
                scale: { name: "cohortX", domain: [0, 1000], zoom: true },
            },
            x2: { field: "end" },
            color: {
                field: "state",
                type: "nominal",
                scale: {
                    domain: ["loss", "neutral", "gain"],
                    range: ["#5090e0", "#e0e0e0", "#ff6040"],
                },
            },
        },
    },
};

const requestedRenderer =
    new URLSearchParams(window.location.search).get("renderer") ?? "auto";
if (!["auto", "canvas", "webgl", "webgpu"].includes(requestedRenderer)) {
    throw new Error("Unknown renderer: " + requestedRenderer);
}

const renderer =
    /** @type {import("@genome-spy/core/types/embedApi.js").EmbedOptions["renderer"]} */ (
        requestedRenderer
    );
const options = {
    wheelBehavior: /** @type {const} */ ("cooperative"),
    renderer,
};
export const [chartApi, viewportApi, cohortApi] = await Promise.all([
    embed("#chart", chartSpec, options),
    embed("#viewport", viewportSpec, options),
    embedApp("#cohort", cohortSpec, {
        ...options,
        embedMode: "embedded",
        renderer: renderer === "webgpu" ? "canvas" : renderer,
    }),
]);

window.addEventListener(
    "pagehide",
    () => [chartApi, viewportApi, cohortApi].forEach((api) => api.finalize()),
    { once: true }
);
