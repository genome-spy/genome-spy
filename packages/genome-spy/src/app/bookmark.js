import { html } from "lit";
import safeMarkdown from "../utils/safeMarkdown";
import { messageBox } from "./utils/ui/modal";

/**
 * @param {Partial<import("./databaseSchema").BookmarkEntry>} entry
 * @param {import("./genomeSpyApp").default} app
 */
export async function restoreBookmark(entry, app) {
    try {
        app.provenance.dispatchBookmark(entry.actions);

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

        if (entry.notes?.length) {
            messageBox(safeMarkdown(entry.notes), entry.name);
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