import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faChevronDown,
    faStepBackward,
    faStepForward,
} from "@fortawesome/free-solid-svg-icons";
import { html, render } from "lit";
import safeMarkdown from "../utils/safeMarkdown";
import { createModal, messageBox } from "../utils/ui/modal";
import { viewSettingsSlice } from "../viewSettingsSlice";

/**
 * @type {import("../utils/ui/modal").Modal}
 */
let infoBox;

/**
 * @param {Partial<import("./databaseSchema").BookmarkEntry>} entry
 * @param {import("../app").default} app
 */
export async function restoreBookmark(entry, app) {
    try {
        if (entry.actions) {
            app.provenance.dispatchBookmark(entry.actions);
        }

        app.storeHelper.dispatch(
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
        messageBox(
            html`<p>Cannot restore the state:</p>
                <p>${e}</p>`
        );
        app.provenance.activateState(0);
    }
}

/**
 * @param {Partial<import("./databaseSchema").BookmarkEntry>} entry
 * @param {import("../app").default} app
 * @param {import("./bookmarkDatabase").default} [bookmarkDatabase]
 *      An optional collection that contains the entry. Used for next/prev buttons.
 */
export async function restoreBookmarkAndShowInfoBox(
    entry,
    app,
    bookmarkDatabase
) {
    await restoreBookmark(entry, app);
    if (entry.notes || infoBox) {
        await showBookmarkInfoBox(entry, app, bookmarkDatabase);
    }
}

/**
 *
 * @param {Partial<import("./databaseSchema").BookmarkEntry>} entry
 * @param {import("../app").default} app
 * @param {import("./bookmarkDatabase").default} [bookmarkDatabase]
 *      An optional collection that contains the entry. Used for next/prev buttons.
 */
export async function showBookmarkInfoBox(entry, app, bookmarkDatabase) {
    infoBox ??= createModal("tour");

    await updateBookmarkInfoBox(entry, app, bookmarkDatabase);
}

/**
 *
 * @param {Partial<import("./databaseSchema").BookmarkEntry>} entry
 * @param {import("../app").default} app
 * @param {import("./bookmarkDatabase").default} [bookmarkDatabase]
 *      An optional collection that contains the entry. Used for next/prev buttons.
 */
export async function updateBookmarkInfoBox(entry, app, bookmarkDatabase) {
    const names = bookmarkDatabase ? await bookmarkDatabase.getNames() : [];

    const entryIndex = names.indexOf(entry.name);

    const tour = entryIndex >= 0;

    const of = tour ? ` ${entryIndex + 1} of ${names.length}` : "";
    const title = `${bookmarkDatabase ? "Bookmark" : "Shared link"}${of}: ${
        entry.name
    }`;

    const content = entry.notes ? safeMarkdown(entry.notes) : "No notes";

    const close = () => {
        infoBox?.close();
        infoBox = undefined;
    };

    const jumpTo = async (/** @type {number} */ index) => {
        // TODO: Prevent double clicks, etc
        const entry = await bookmarkDatabase.get(names[index]);
        restoreBookmarkAndShowInfoBox(entry, app, bookmarkDatabase);
    };

    const buttons = tour
        ? html`
              <button @click=${close}>Close</button>
              <button
                  @click=${() => jumpTo(entryIndex - 1)}
                  ?disabled=${entryIndex <= 0}
              >
                  ${icon(faStepBackward).node[0]} Previous
              </button>
              <button
                  @click=${() => jumpTo(entryIndex + 1)}
                  ?disabled=${entryIndex >= names.length - 1}
              >
                  Next ${icon(faStepForward).node[0]}
              </button>
          `
        : html` <button @click=${close}>Close</button> `;

    const toggleCollapse = (/** @type {MouseEvent} */ event) =>
        /** @type {HTMLElement} */ (event.target)
            .closest(".gs-modal")
            .classList.toggle("collapsed");

    const template = html`
        <button title="Collapse" class="collapse" @click=${toggleCollapse}>
            ${icon(faChevronDown).node[0]}
        </button>
        <div class="modal-title">${title}</div>
        <div class="modal-body markdown" style="max-width: 600px">
            ${content}
        </div>
        <div class="modal-buttons">${buttons}</div>
    `;

    render(template, infoBox.content);
}
