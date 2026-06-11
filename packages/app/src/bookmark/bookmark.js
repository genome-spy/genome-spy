import { html } from "lit";
import "../components/dialogs/bookmarkInfoBox.js";
import { viewSettingsSlice } from "../viewSettingsSlice.js";
import { normalizeViewSettingsPayload } from "../viewSettingsUtils.js";
import { showMessageDialog } from "../components/generic/messageDialog.js";
import { showDialog } from "../components/generic/baseDialog.js";
import { showEnterBookmarkInfoDialog } from "../components/dialogs/enterBookmarkDialog.js";
import { createPlotBookmarkContext } from "./bookmarkState.js";

/**
 * @typedef {object} BookmarkInfoBoxOptions
 * @prop {import("./bookmarkDatabase.js").default} [database]
 *      An optional bookmark database that contains the entry. Used for next/prev buttons.
 * @prop {"default" | "tour" | "shared"} [mode]
 * @prop {string} [afterTourBookmark] See `RemoteBookmarkConfig`
 * @prop {BookmarkPlotRestoreResult[]} [plotResults]
 * @prop {string} [baseUrl]
 */

/**
 * @typedef {object} BookmarkPlotRestoreResult
 * @prop {import("../charts/sampleAttributePlotTypes.d.ts").SampleAttributePlot} [plot]
 * @prop {string} [error]
 */

/**
 * Resets the provenance and scales to defaults.
 * TODO: Move elsewhere since this could be useful for a "reset" button.
 *
 * @param {import("../app.js").default} app
 */
export function resetToDefaultState(app) {
    for (const scaleResolution of app.genomeSpy
        .getNamedScaleResolutions()
        .values()) {
        if (scaleResolution.isZoomable()) {
            scaleResolution.resetZoom();
        }
    }

    const store = app.store;

    if (app.provenance.isUndoable()) {
        app.provenance.activateInitialState();
    }
    store.dispatch(viewSettingsSlice.actions.restoreDefaultVisibilities());
}

/**
 * @param {import("./databaseSchema.js").BookmarkEntry} entry
 * @param {import("../app.js").default} app
 * @returns {Promise<{ plots: BookmarkPlotRestoreResult[] }>}
 */
export async function restoreBookmark(entry, app) {
    try {
        if (entry.actions) {
            if (app.provenance.isUndoable()) {
                app.provenance.activateInitialState();
                await app.getSampleView?.()?.awaitMetadataReady();
            }
            if (!app.intentPipeline) {
                throw new Error(
                    "Intent pipeline is required to restore bookmarks."
                );
            }
            await app.intentPipeline.submit(entry.actions, {
                submissionKind: "bookmark",
            });
            await app.paramProvenanceBridge?.whenApplied();
        }

        const normalized = normalizeViewSettingsPayload(entry.viewSettings);
        app.store.dispatch(
            viewSettingsSlice.actions.setViewSettings(normalized)
        );

        /** @type {Promise<void>[]} */
        const promises = [];
        for (const [name, scaleDomain] of Object.entries(
            entry.scaleDomains ?? {}
        )) {
            const scaleResolution = app.genomeSpy
                .getNamedScaleResolutions()
                .get(name);
            if (scaleResolution) {
                promises.push(scaleResolution.zoomTo(scaleDomain));
            } else {
                console.warn(
                    `Cannot restore scale domain. Unknown name: ${name}`
                );
            }
        }
        await Promise.all(promises);

        return {
            plots: await rebuildBookmarkPlots(entry, app),
        };
    } catch (e) {
        console.error(e);
        if (app.store.getState().intentStatus?.status === "error") {
            return { plots: [] };
        }
        // Non-pipeline restore failures (view settings/scale domains) are
        // reported here; pipeline errors are handled via intent status UI.
        showMessageDialog(
            html`<p>Cannot restore the state:</p>
                <p>${e}</p>`,
            { type: "error" }
        );
        app.provenance.activateInitialState();
        return { plots: [] };
    }
}

/**
 * @param {import("./databaseSchema.js").BookmarkEntry} entry
 * @param {import("../app.js").default} app
 * @returns {Promise<BookmarkPlotRestoreResult[]>}
 */
export async function rebuildBookmarkPlots(entry, app) {
    const attachments = entry.plots ?? [];
    if (!attachments.length) {
        return [];
    }

    const agentApi = await app.getAgentApi();
    /** @type {BookmarkPlotRestoreResult[]} */
    const results = [];
    for (const attachment of attachments) {
        try {
            const plot = await agentApi.buildSampleAttributePlot(
                attachment.definition
            );
            if (!plot) {
                throw new Error("Plot could not be rebuilt.");
            }
            results.push({ plot });
        } catch (error) {
            results.push({
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    return results;
}
/**
 * @param {import("./databaseSchema.js").BookmarkEntry} entry
 * @param {import("../app.js").default} app
 */
export async function importBookmark(entry, app) {
    if (
        await showEnterBookmarkInfoDialog(
            app.localBookmarkDatabase,
            entry,
            "add"
        )
    ) {
        try {
            await app.localBookmarkDatabase.put(entry);
        } catch (e) {
            console.warn(e);
            showMessageDialog(`Cannot import bookmark: ${e}`, {
                type: "error",
            });
        }
    }
}

/**
 * @param {import("./databaseSchema.js").BookmarkEntry} entry
 * @param {import("../app.js").default} app
 * @param {BookmarkInfoBoxOptions} [options]
 */
export async function restoreBookmarkAndShowInfoBox(entry, app, options = {}) {
    const restoreResult = await restoreBookmark(entry, app);
    const shouldShow =
        restoreResult.plots.length ||
        entry.notes ||
        (options.mode == "shared" && (entry.name || entry.notes));
    if (shouldShow) {
        await showBookmarkInfoBox(entry, app, {
            ...options,
            plotResults: restoreResult.plots,
        });
        return;
    }
    const existingDialog =
        /** @type {import("../components/dialogs/bookmarkInfoBox.js").default} */ (
            document.body.querySelector("gs-bookmark-info-box")
        );
    if (existingDialog) {
        existingDialog.closeDialog();
    }
}

/**
 *
 * @param {import("./databaseSchema.js").BookmarkEntry} entry
 * @param {import("../app.js").default} app
 * @param {BookmarkInfoBoxOptions} [options]
 */
export async function showBookmarkInfoBox(entry, app, options = {}) {
    const existingDialog =
        /** @type {import("../components/dialogs/bookmarkInfoBox.js").default} */ (
            document.body.querySelector("gs-bookmark-info-box")
        );

    if (existingDialog) {
        existingDialog.baseUrl = getBookmarkInfoBoxBaseUrl(app, options);
        existingDialog.entry = entry;
        existingDialog.mode = options.mode ?? "default";
        existingDialog.plotResults = options.plotResults ?? [];
        existingDialog.plotBookmarkContext = createPlotBookmarkContext(app);
    } else {
        showDialog(
            "gs-bookmark-info-box",
            async (
                /** @type {import("../components/dialogs/bookmarkInfoBox.js").default} */
                el
            ) => {
                el.baseUrl = getBookmarkInfoBoxBaseUrl(app, options);
                el.entry = entry;
                el.mode = options.mode ?? "default";
                el.plotResults = options.plotResults ?? [];
                el.plotBookmarkContext = createPlotBookmarkContext(app);
                el.allowImport = !!options.database;

                if (options.database) {
                    el.names = await options.database.getNames();
                }
            }
        ).then(async () => {
            if (options.mode == "tour") {
                const atb = options.afterTourBookmark;
                if (typeof atb == "string") {
                    const entry = await options.database.get(atb);
                    if (!entry) {
                        throw new Error(`No such bookmark: ${atb}`);
                    }
                    restoreBookmark(entry, app);
                } else if (atb === null) {
                    // Do nothing
                } else {
                    resetToDefaultState(app);
                }
            }
        });

        // TODO: Come up with a nicer way to get handle to the element and define listeners
        const addedDialog =
            /** @type {import("../components/dialogs/bookmarkInfoBox.js").default} */ (
                document.body.querySelector("gs-bookmark-info-box")
            );

        if (options.database) {
            addedDialog.addEventListener(
                "gs-jump-to-bookmark",
                async (/** @type {CustomEvent} */ event) => {
                    const name = event.detail.name;
                    restoreBookmarkAndShowInfoBox(
                        await options.database.get(name),
                        app,
                        options
                    );
                }
            );

            addedDialog.addEventListener(
                "gs-import-bookmark",
                async (/** @type {CustomEvent} */ event) => {
                    importBookmark(event.detail.entry, app);
                }
            );
        }
    }
}

/**
 * @param {import("../app.js").default} app
 * @param {BookmarkInfoBoxOptions} options
 */
export function getBookmarkInfoBoxBaseUrl(app, options) {
    return (
        options.database?.baseUrl ??
        options.baseUrl ??
        app.genomeSpy.spec.baseUrl
    );
}
