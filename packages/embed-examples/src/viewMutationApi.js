import { embed } from "@genome-spy/core/minimal";
import { html, render } from "lit";

/*
 * This example demonstrates the public view hierarchy API from an embedding
 * application. It starts with a small genome-browser-like stack of tracks and
 * lets the user add, remove, and reorder tracks without rebuilding the whole
 * GenomeSpy instance.
 *
 * The key API pieces are:
 * - named container lookup with api.views.get(...)
 * - repeated insertion of ordinary specs using explicit scopes
 * - stable ViewHandle objects for later move/remove operations
 * - layout bounds and layout subscriptions for positioning external controls
 */

const container = document.getElementById("container");
const dashboard = document.getElementById("dashboard");
const trackControls = document.getElementById("track-controls");
const trackCounts = { signal: 0, variants: 0 };

const initialTrackSpecs = [createSignalTrack(), createVariantsTrack()];

/** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
const spec = {
    vconcat: [
        {
            // The mutable part of the visualization is a normal vconcat view.
            // Its name gives the embedding code a stable address for inserting
            // and reordering child tracks.
            name: "tracks",
            spacing: 5,
            resolve: {
                // Shared x axes and color legends continue to work when tracks
                // are inserted, removed, or reordered dynamically.
                axis: { x: "shared" },
                scale: { color: "shared" },
                legend: { color: "shared" },
            },
            vconcat: initialTrackSpecs,
        },
    ],

    config: {
        view: {
            stroke: "lightgray",
        },
        style: {
            "overlay-title": {
                offset: -5,
                dx: 5,
            },
        },
    },
};

const api = await embed(container, spec);

// Resolve the container once and keep the handle. Handles remain valid while
// their views are live, even if sibling tracks are inserted or reordered.
const tracksContainer = api.views.get({ scope: [], view: "tracks" });

/** @type {TrackItem[]} */
// Local UI model for the external controls. GenomeSpy state lives in the view
// hierarchy; this array just mirrors successful hierarchy mutations.
const tracks = initialTrackSpecs.map((spec) => ({
    title: getTitleText(spec.title),
    // Initial views were not inserted with extra scopes, so they live in the
    // root selector scope and are addressable directly by their spec names.
    handle: api.views.get({
        scope: [],
        view: /** @type {string} */ (spec.name),
    }),
}));

let status = "Ready";

// Layout changes after data loading, mutations, and resizes. The subscription
// keeps the external overlay controls aligned with the rendered tracks.
api.views.subscribeToLayout(updateControls);
updateControls();

/**
 * @typedef {{
 *   title: string,
 *   handle: import("@genome-spy/core/types/embedApi.js").ViewHandle
 * }} TrackItem
 */

/**
 * @param {import("@genome-spy/core/spec/view.js").ViewSpec["title"]} title
 */
function getTitleText(title) {
    if (typeof title === "string") {
        return title;
    }

    return title?.text ?? "";
}

/**
 * @returns {import("@genome-spy/core/spec/view.js").UnitSpec}
 */
function createSignalTrack() {
    const number = ++trackCounts.signal;

    return {
        name: "signal",
        title: { text: "Signal track " + number, style: "overlay-title" },
        height: 80,
        data: {
            values: createSignalValues(),
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

    return {
        name: "variants",
        title: { text: "Variants track " + number, style: "overlay-title" },
        height: 36,
        data: {
            values: createVariantValues(),
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
    const title = getTitleText(spec.title);
    const scope = type + "-" + trackCounts[type];

    try {
        // Scope lets the same ordinary spec shape be inserted repeatedly while
        // remaining addressable by selectors such as
        // { scope: ["signal-2"], view: "signal" }.
        const handle = await api.views.insert(tracksContainer, spec, { scope });
        tracks.push({ title, handle });
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
        `,
        dashboard
    );
    render(
        html`
            ${tracks.map((track, index) => {
                const bounds = api.views.getLayoutBounds(track.handle);
                if (!bounds) {
                    return "";
                }

                // View bounds are in the GenomeSpy canvas coordinate space.
                // The overlay shares that origin, so CSS pixels map directly.
                const style =
                    "left: " +
                    (bounds.x + bounds.width - 4) +
                    "px; top: " +
                    (bounds.y + 4) +
                    "px";

                return html`
                    <div class="track-controls" style=${style}>
                        <button
                            title=${"Move " + track.title + " up"}
                            ?disabled=${index === 0}
                            @click=${() => moveTrack(track, -1)}
                        >
                            Up
                        </button>
                        <button
                            title=${"Move " + track.title + " down"}
                            ?disabled=${index === tracks.length - 1}
                            @click=${() => moveTrack(track, 1)}
                        >
                            Down
                        </button>
                        <button
                            title=${"Remove " + track.title}
                            @click=${() => removeTrack(track)}
                        >
                            Remove
                        </button>
                    </div>
                `;
            })}
        `,
        trackControls
    );
}

/**
 * @returns {{ pos: number, value: number }[]}
 */
function createSignalValues() {
    return Array.from({ length: 64 }, (_, pos) => ({
        pos,
        value: Math.random(),
    }));
}

/**
 * @returns {{ pos: number, type: string }[]}
 */
function createVariantValues() {
    const variantTypes = ["SNV", "DEL", "DUP"];

    return Array.from({ length: 12 }, () => ({
        pos: Math.floor(Math.random() * 64),
        type: variantTypes[Math.floor(Math.random() * variantTypes.length)],
    })).sort((a, b) => a.pos - b.pos);
}
