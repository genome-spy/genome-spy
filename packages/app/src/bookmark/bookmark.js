import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faBookmark,
    faChevronDown,
    faStepBackward,
    faStepForward,
} from "@fortawesome/free-solid-svg-icons";
import { html, nothing, render } from "lit";
import { ActionCreators } from "redux-undo";
import safeMarkdown from "../utils/safeMarkdown.js";
import { createModal } from "../utils/ui/modal.js";
import { showEnterBookmarkInfoDialog } from "../components/dialogs/enterBookmarkDialog.js";
import { viewSettingsSlice } from "../viewSettingsSlice.js";
import { showMessageDialog } from "../components/dialogs/messageDialog.js";

/**
 * @typedef {object} BookmarkInfoBoxOptions
 * @prop {import("./bookmarkDatabase.js").default} [database]
 *      An optional bookmark database that contains the entry. Used for next/prev buttons.
 * @prop {"default" | "tour" | "shared"} [mode]
 * @prop {string} [afterTourBookmark] See `RemoteBookmarkConfig`
 */

/**
 * @type {import("../utils/ui/modal.js").Modal}
 */
let infoBox;

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
            app.provenance.dispatchBookmark(entry.actions);
        }

        app.store.dispatch(
            viewSettingsSlice.actions.setViewSettings(entry.viewSettings)
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
 * @param {BookmarkInfoBoxOptions} [options]
 */
export async function restoreBookmarkAndShowInfoBox(entry, app, options = {}) {
    await restoreBookmark(entry, app);
    if (
        infoBox ||
        entry.notes ||
        (options.mode == "shared" && (entry.name || entry.notes))
    ) {
        await showBookmarkInfoBox(entry, app, options);
    }
}

/**
 *
 * @param {import("./databaseSchema.js").BookmarkEntry} entry
 * @param {import("../app.js").default} app
 * @param {BookmarkInfoBoxOptions} [options]
 */
export async function showBookmarkInfoBox(entry, app, options = {}) {
    infoBox ??= createModal("tour", app.appContainer);

    await updateBookmarkInfoBox(entry, app, options);
}

/**
 *
 * @param {import("./databaseSchema.js").BookmarkEntry} entry
 * @param {import("../app.js").default} app
 * @param {BookmarkInfoBoxOptions} [options]
 */
export async function updateBookmarkInfoBox(entry, app, options) {
    const db = options.database;

    const names = db ? await db.getNames() : [];

    const entryIndex = names.indexOf(entry.name);

    const of = db ? ` ${entryIndex + 1} of ${names.length}` : "";
    const title = `${
        options.mode == "shared" ? "Shared bookmark" : "Bookmark"
    }${of}: ${entry.name ?? "Unnamed"}`;

    const content = entry.notes
        ? safeMarkdown(entry.notes, {
              // TODO: It's actually the bookmarkDatabase's url that should be used as a baseUrl
              baseUrl: app.genomeSpy.spec.baseUrl,
          })
        : html`<span class="no-notes">No notes provided</span>`;

    const close = async () => {
        infoBox?.close();
        infoBox = undefined;

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
    };

    const jumpTo = async (/** @type {number} */ index) => {
        // TODO: Prevent double clicks, etc
        const entry = await db.get(names[index]);
        restoreBookmarkAndShowInfoBox(entry, app, options);
        // Transfer focus so that keyboard shortcuts such as peek (e) are handled correctly
        app.appContainer.querySelector("canvas").focus();
    };

    const importBookmark = async () => {
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
    };

    const buttons = html` <button class="btn" @click=${close}>
            ${options.mode == "tour" ? "End tour" : "Close"}
        </button>
        ${options.mode == "shared" && app.localBookmarkDatabase
            ? html`
                  <button class="btn" @click=${importBookmark}>
                      ${icon(faBookmark).node[0]} Import bookmark
                  </button>
              `
            : nothing}
        ${db
            ? html` <button
                      class="btn"
                      @click=${() => jumpTo(entryIndex - 1)}
                      ?disabled=${entryIndex <= 0}
                  >
                      ${icon(faStepBackward).node[0]} Previous
                  </button>
                  <button
                      class="btn"
                      @click=${() => jumpTo(entryIndex + 1)}
                      ?disabled=${entryIndex >= names.length - 1}
                  >
                      Next ${icon(faStepForward).node[0]}
                  </button>`
            : nothing}`;

    const toggleCollapse = (/** @type {MouseEvent} */ event) =>
        /** @type {HTMLElement} */ (event.target)
            .closest(".gs-modal")
            .classList.toggle("collapsed");

    const template = html`
        <button title="Collapse" class="btn collapse" @click=${toggleCollapse}>
            ${icon(faChevronDown).node[0]}
        </button>
        <div class="modal-title">${title}</div>
        <div class="modal-body" style="max-width: 600px">${content}</div>
        <div class="modal-buttons">${buttons}</div>
    `;

    render(template, infoBox.content);
}
