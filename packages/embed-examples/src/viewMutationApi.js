import { embed } from "@genome-spy/core/minimal";
import { html, render } from "lit";

/** @type {import("@genome-spy/core/spec/view.js").UnitSpec} */
const signalTrack = {
    name: "signal",
    height: 80,
    data: {
        values: [
            { pos: 0, value: 0.2 },
            { pos: 1, value: 0.8 },
            { pos: 2, value: 0.4 },
            { pos: 3, value: 0.9 },
        ],
    },
    mark: "rect",
    encoding: {
        x: {
            field: "pos",
            type: "index",
            scale: { name: "position", domain: [0, 4] },
        },
        y: { field: "value", type: "quantitative" },
        color: { value: "steelblue" },
    },
};

/** @type {import("@genome-spy/core/spec/view.js").UnitSpec} */
const variantsTrack = {
    name: "variants",
    height: 60,
    data: {
        values: [
            { pos: 0.5, type: "SNV" },
            { pos: 1.5, type: "DEL" },
            { pos: 2.5, type: "SNV" },
        ],
    },
    mark: { type: "point", size: 140 },
    encoding: {
        x: {
            field: "pos",
            type: "index",
            scale: { name: "position" },
        },
        color: { field: "type", type: "nominal" },
    },
};

/** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
const spec = {
    width: 600,
    vconcat: [
        {
            name: "tracks",
            spacing: 4,
            vconcat: [signalTrack, variantsTrack],
        },
    ],
};

const container = document.getElementById("container");
const dashboard = document.getElementById("dashboard");

const api = await embed(container, spec);

const root = api.views.root();
const tracks = api.views.get({ scope: [], view: "tracks" });
const signal = api.views.get({ scope: [], view: "signal" });

updateDashboard();

function updateDashboard() {
    render(
        html`
            <p>
                <button @click=${updateDashboard}>Refresh handles</button>
            </p>
            <dl>
                <dt>Root</dt>
                <dd><code>${JSON.stringify(summarizeHandle(root))}</code></dd>

                <dt>Tracks</dt>
                <dd><code>${JSON.stringify(summarizeHandle(tracks))}</code></dd>

                <dt>Signal</dt>
                <dd><code>${JSON.stringify(summarizeHandle(signal))}</code></dd>
            </dl>
        `,
        dashboard
    );
}

/**
 * @param {import("@genome-spy/core/types/embedApi.js").ViewHandle} handle
 */
function summarizeHandle(handle) {
    return {
        id: handle.id,
        name: handle.name,
        selector: handle.selector,
        type: handle.type,
        alive: handle.isAlive(),
        parent: handle.parent()?.name,
        children: handle.children().map((child) => child.name ?? child.id),
    };
}
