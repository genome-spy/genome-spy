import { html } from "lit";
import { ActionCreators } from "redux-undo";
import "../components/dialogs/bookmarkInfoBox.js";
import { viewSettingsSlice } from "../viewSettingsSlice.js";
import { normalizeViewSettingsPayload } from "../viewSettingsUtils.js";
import { showMessageDialog } from "../components/generic/messageDialog.js";
import { showDialog } from "../components/generic/baseDialog.js";
import { showEnterBookmarkInfoDialog } from "../components/dialogs/enterBookmarkDialog.js";

/**
 * @typedef {object} BookmarkInfoBoxOptions
 * @prop {import("./bookmarkDatabase.js").default} [database]
 *      An optional bookmark database that contains the entry. Used for next/prev buttons.
 * @prop {"default" | "tour" | "shared"} [mode]
 * @prop {string} [afterTourBookmark] See `RemoteBookmarkConfig`
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
        store.dispatch(ActionCreators.jumpToPast(0));
    }
    store.dispatch(viewSettingsSlice.actions.restoreDefaultVisibilities());
}

/**
 * @param {import("./databaseSchema.js").BookmarkEntry} entry
 * @param {import("../app.js").default} app
 */
export async function restoreBookmark(entry, app) {
    try {
        if (entry.actions) {
            if (app.provenance.isUndoable()) {
                app.store.dispatch(ActionCreators.jumpToPast(0));
            }
            if (!app.intentPipeline) {
                throw new Error(
                    "Intent pipeline is required to restore bookmarks."
                );
            }
            await app.intentPipeline.submit(entry.actions);
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
    } catch (e) {
        console.error(e);
        if (app.store.getState().intentStatus?.status === "error") {
            return;
        }
        // Non-pipeline restore failures (view settings/scale domains) are
        // reported here; pipeline errors are handled via intent status UI.
        showMessageDialog(
            html`<p>Cannot restore the state:</p>
                <p>${e}</p>`,
            { type: "error" }
        );
        app.provenance.activateState(0);
    }
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
    await restoreBookmark(entry, app);
    const shouldShow =
        entry.notes ||
        (options.mode == "shared" && (entry.name || entry.notes));
    if (shouldShow) {
        await showBookmarkInfoBox(entry, app, options);
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
        existingDialog.entry = entry;
        existingDialog.mode = options.mode ?? "default";
    } else {
        showDialog(
            "gs-bookmark-info-box",
            async (
                /** @type {import("../components/dialogs/bookmarkInfoBox.js").default} */
                el
            ) => {
                // TODO: It's actually the bookmarkDatabase's url that should be used as a baseUrl
                el.baseUrl = app.genomeSpy.spec.baseUrl;
                el.entry = entry;
                el.mode = options.mode ?? "default";
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
