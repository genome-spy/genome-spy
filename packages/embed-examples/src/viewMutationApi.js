import { embed } from "@genome-spy/core/minimal";
import { html, render } from "lit";

const container = document.getElementById("container");
const dashboard = document.getElementById("dashboard");
const trackCounts = { signal: 0, variants: 0 };

const initialTrackSpecs = [createSignalTrack(), createVariantsTrack()];

/** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
const spec = {
    vconcat: [
        {
            name: "tracks",
            spacing: 4,
            resolve: { axis: { x: "shared" } },
            vconcat: initialTrackSpecs,
        },
    ],

    config: {
        view: {
            stroke: "lightgray",
        },
    },
};

const api = await embed(container, spec);
const tracksContainer = api.views.get({ scope: [], view: "tracks" });

/** @type {TrackItem[]} */
const tracks = initialTrackSpecs.map((spec) => ({
    title: /** @type {string} */ (spec.title),
    handle: api.views.get({
        scope: [],
        view: /** @type {string} */ (spec.name),
    }),
}));

let status = "Ready";
updateControls();

/**
 * @typedef {{
 *   title: string,
 *   handle: import("@genome-spy/core/types/embedApi.js").ViewHandle,
 *   scope?: string
 * }} TrackItem
 */

/**
 * @returns {import("@genome-spy/core/spec/view.js").UnitSpec}
 */
function createSignalTrack() {
    const number = ++trackCounts.signal;

    return {
        name: "signal",
        title: "Signal track " + number,
        height: 80,
        data: {
            values: Array.from({ length: 64 }, (_, pos) => ({
                pos,
                value: Math.random(),
            })),
        },
        mark: "rect",
        encoding: {
            x: { field: "pos", type: "index" },
            y: { field: "value", type: "quantitative" },
            color: { value: "steelblue" },
        },
    };
}

/**
 * @returns {import("@genome-spy/core/spec/view.js").UnitSpec}
 */
function createVariantsTrack() {
    const number = ++trackCounts.variants;
    const variantTypes = ["SNV", "DEL", "DUP"];

    return {
        name: "variants",
        title: "Variants track " + number,
        height: 36,
        data: {
            values: Array.from({ length: 12 }, () => ({
                pos: Math.random() * 63,
                type: variantTypes[
                    Math.floor(Math.random() * variantTypes.length)
                ],
            })).sort((a, b) => a.pos - b.pos),
        },
        mark: { type: "point", size: 120 },
        encoding: {
            x: { field: "pos", type: "index" },
            color: { field: "type", type: "nominal" },
        },
    };
}

/**
 * @param {"signal" | "variants"} type
 * @returns {Promise<void>}
 */
async function addTrack(type) {
    const spec =
        type === "signal" ? createSignalTrack() : createVariantsTrack();
    const title = /** @type {string} */ (spec.title);
    const scope = type + "-" + trackCounts[type];

    try {
        // Scope lets this ordinary spec be inserted repeatedly while remaining
        // addressable by selectors such as { scope: ["signal-2"], view: "signal" }.
        const handle = await api.views.insert(tracksContainer, spec, { scope });
        tracks.push({ title, handle, scope });
        status = "Added " + title;
    } catch (error) {
        status = error instanceof Error ? error.message : "Track insert failed";
    }

    updateControls();
}

/**
 * @param {TrackItem} track
 * @returns {Promise<void>}
 */
async function removeTrack(track) {
    try {
        await api.views.remove(track.handle);
        tracks.splice(tracks.indexOf(track), 1);
        status = "Removed " + track.title;
    } catch (error) {
        status =
            error instanceof Error ? error.message : "Track removal failed";
    }

    updateControls();
}

/**
 * @param {TrackItem} track
 * @param {number} offset
 * @returns {Promise<void>}
 */
async function moveTrack(track, offset) {
    const from = tracks.indexOf(track);
    const to = from + offset;

    try {
        // The destination index uses the order after the target has been removed.
        await api.views.move(track.handle, { index: to });
        tracks.splice(from, 1);
        tracks.splice(to, 0, track);
        status = "Moved " + track.title;
    } catch (error) {
        status = error instanceof Error ? error.message : "Track move failed";
    }

    updateControls();
}

/**
 * @returns {void}
 */
function updateControls() {
    render(
        html`
            <p>
                <button @click=${() => addTrack("signal")}>Add signal</button>
                <button @click=${() => addTrack("variants")}>
                    Add variants
                </button>
            </p>
            <p>Status: ${status}</p>
            <ol>
                ${tracks.map(
                    (track, index) => html`
                        <li>
                            ${track.title}
                            <button
                                ?disabled=${index === 0}
                                @click=${() => moveTrack(track, -1)}
                            >
                                Up
                            </button>
                            <button
                                ?disabled=${index === tracks.length - 1}
                                @click=${() => moveTrack(track, 1)}
                            >
                                Down
                            </button>
                            <button @click=${() => removeTrack(track)}>
                                Remove
                            </button>
                        </li>
                    `
                )}
            </ol>
        `,
        dashboard
    );
}
