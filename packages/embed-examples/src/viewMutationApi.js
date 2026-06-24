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
const summaryTrack = {
    name: "summary",
    height: 50,
    data: {
        values: [
            { pos: 0, value: 0.35 },
            { pos: 1, value: 0.7 },
            { pos: 2, value: 0.5 },
            { pos: 3, value: 0.65 },
        ],
    },
    mark: "bar",
    encoding: {
        x: {
            field: "pos",
            type: "index",
            scale: { name: "position" },
        },
        y: { field: "value", type: "quantitative" },
        color: { value: "seagreen" },
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

/** @type {{ scope: string, handle: import("@genome-spy/core/types/embedApi.js").ViewHandle }[]} */
const insertedSummaries = [];

let nextSummaryIndex = 1;
let status = "Ready";

updateDashboard();

async function insertSummaryTrack() {
    const scope = "summary-" + nextSummaryIndex;

    try {
        const handle = await api.views.insert(tracks, summaryTrack, {
            scope,
        });
        insertedSummaries.push({ scope, handle });
        nextSummaryIndex++;
        status = "Inserted " + scope;
    } catch (error) {
        status =
            error instanceof Error ? error.message : "Summary insert failed";
    }

    updateDashboard();
}

/**
 * @param {{ scope: string, handle: import("@genome-spy/core/types/embedApi.js").ViewHandle }} summary
 */
async function removeSummaryTrack(summary) {
    try {
        await api.views.remove(summary.handle);
        status = "Removed " + summary.scope;
    } catch (error) {
        status =
            error instanceof Error ? error.message : "Summary removal failed";
    }

    updateDashboard();
}

/**
 * @param {{ scope: string, handle: import("@genome-spy/core/types/embedApi.js").ViewHandle }} summary
 * @param {number} offset
 */
async function moveSummaryTrack(summary, offset) {
    try {
        const currentIndex = getTrackIndex(summary.handle);
        await api.views.move(summary.handle, {
            index: currentIndex + offset,
        });
        status = "Moved " + summary.scope;
    } catch (error) {
        status = error instanceof Error ? error.message : "Summary move failed";
    }

    updateDashboard();
}

function updateDashboard() {
    render(
        html`
            <p>
                <button @click=${updateDashboard}>Refresh handles</button>
                <button @click=${insertSummaryTrack}>
                    Insert summary track
                </button>
            </p>
            <p>Status: ${status}</p>
            <dl>
                <dt>Root</dt>
                <dd><code>${JSON.stringify(summarizeHandle(root))}</code></dd>

                <dt>Tracks</dt>
                <dd><code>${JSON.stringify(summarizeHandle(tracks))}</code></dd>

                <dt>Signal</dt>
                <dd><code>${JSON.stringify(summarizeHandle(signal))}</code></dd>

                <dt>Inserted summaries</dt>
                <dd>
                    ${insertedSummaries.map(
                        (summary) => html`
                            <p>
                                <button
                                    ?disabled=${!canMoveTrack(
                                        summary.handle,
                                        -1
                                    )}
                                    @click=${() =>
                                        moveSummaryTrack(summary, -1)}
                                >
                                    Up
                                </button>
                                <button
                                    ?disabled=${!canMoveTrack(
                                        summary.handle,
                                        1
                                    )}
                                    @click=${() => moveSummaryTrack(summary, 1)}
                                >
                                    Down
                                </button>
                                <button
                                    ?disabled=${!summary.handle.isAlive()}
                                    @click=${() => removeSummaryTrack(summary)}
                                >
                                    Remove ${summary.scope}
                                </button>
                                <code
                                    >${JSON.stringify(
                                        summarizeInsertedSummary(summary)
                                    )}</code
                                >
                            </p>
                        `
                    )}
                </dd>
            </dl>
        `,
        dashboard
    );
}

/**
 * @param {import("@genome-spy/core/types/embedApi.js").ViewHandle} handle
 */
function getTrackIndex(handle) {
    return tracks.children().indexOf(handle);
}

/**
 * @param {import("@genome-spy/core/types/embedApi.js").ViewHandle} handle
 * @param {number} offset
 */
function canMoveTrack(handle, offset) {
    const currentIndex = getTrackIndex(handle);
    const destinationIndex = currentIndex + offset;
    return (
        currentIndex >= 0 &&
        destinationIndex >= 0 &&
        destinationIndex <= tracks.children().length - 1
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

/**
 * @param {{ scope: string, handle: import("@genome-spy/core/types/embedApi.js").ViewHandle }} summary
 */
function summarizeInsertedSummary(summary) {
    const selector = summary.handle.isAlive()
        ? api.views.get({ scope: [summary.scope], view: "summary" }).selector
        : undefined;

    return {
        scope: summary.scope,
        handle: summarizeHandle(summary.handle),
        scopedSelector: selector,
    };
}
