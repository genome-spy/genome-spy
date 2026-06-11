import { buildViewSettingsPayload } from "../viewSettingsUtils.js";
import { collectScaleDomains } from "./scaleDomainUtils.js";

/**
 * @param {import("../app.js").default} app
 * @param {{ plots?: import("./databaseSchema.d.ts").BookmarkPlotAttachment[] }} [options]
 * @returns {import("./databaseSchema.d.ts").BookmarkEntry}
 */
export function createBookmarkWithCurrentState(app, options = {}) {
    /** @type {import("./databaseSchema.d.ts").BookmarkEntry} */
    const bookmark = {
        name: undefined,
        actions: app.provenance.getBookmarkableActionHistory(),
        scaleDomains: {},
    };

    const viewSettings = app.store.getState().viewSettings;
    const viewRoot = app.genomeSpy.viewRoot;
    if (viewRoot) {
        const viewSettingsPayload = buildViewSettingsPayload(
            viewRoot,
            viewSettings
        );
        if (viewSettingsPayload) {
            bookmark.viewSettings = viewSettingsPayload;
        }
    }

    bookmark.scaleDomains = collectScaleDomains(
        app.genomeSpy,
        (scaleResolution) => scaleResolution.isZoomable()
    );

    if (options.plots?.length) {
        bookmark.plots = options.plots;
    }

    return bookmark;
}
