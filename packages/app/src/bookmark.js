import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faStepBackward,
    faStepForward,
} from "@fortawesome/free-solid-svg-icons";
import { html, render } from "lit";
import safeMarkdown from "./utils/safeMarkdown";
import { createModal, messageBox } from "./utils/ui/modal";
import { viewSettingsSlice } from "./viewSettingsSlice";

/**
 * @param {Partial<import("./databaseSchema").BookmarkEntry>} entry
 * @param {import("./app").default} app
 * @param {Partial<import("./databaseSchema").BookmarkEntry[]>} [entryCollection]
 *      An optional collection that contains the entry. Used for next/prev buttons.
 */
export async function restoreBookmark(entry, app, entryCollection) {
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

        if (entry.notes?.length || entryCollection?.length) {
            createOrUpdateMessageBox(entry, app, entryCollection);
        }
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
 *
 * @param {Partial<import("./databaseSchema").BookmarkEntry>} entry
 * @param {import("./app").default} app
 * @param {Partial<import("./databaseSchema").BookmarkEntry[]>} [entryCollection]
 *      An optional collection that contains the entry. Used for next/prev buttons.
 */
function createOrUpdateMessageBox(entry, app, entryCollection) {
    const entryIndex = entryCollection
        ? entryCollection.findIndex((e) => e.name == entry.name)
        : -1;
    const tour = entryIndex >= 0;

    const modal = createModal("tour");

    return new Promise((resolve, reject) => {
        const close = () => {
            modal.close();
            resolve(true);
        };

        const of = tour
            ? ` ${entryIndex + 1} of ${entryCollection.length}`
            : "";

        const title = `Bookmark${of}: ${entry.name}`;

        const content = safeMarkdown(entry.notes);

        const buttons = tour
            ? html`
                  <button @click=${close}>Close</button>
                  <button ?disabled=${entryIndex <= 0}>
                      ${icon(faStepBackward).node[0]} Previous
                  </button>
                  <button ?disabled=${entryIndex >= entryCollection.length - 1}>
                      Next ${icon(faStepForward).node[0]}
                  </button>
              `
            : html` <button @click=${close}>Close</button> `;

        const template = html`
            <div class="modal-title">${title}</div>
            <div class="modal-body" style="max-width: 700px">${content}</div>
            <div class="modal-buttons">${buttons}</div>
        `;

        render(template, modal.content);
    });
}
