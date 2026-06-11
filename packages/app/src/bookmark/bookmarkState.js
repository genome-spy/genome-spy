import { buildViewSettingsPayload } from "../viewSettingsUtils.js";
import { collectScaleDomains } from "./scaleDomainUtils.js";

/**
 * @typedef {object} PlotBookmarkContext
 * @prop {(plots: import("./databaseSchema.d.ts").BookmarkPlotAttachment[]) => import("./databaseSchema.d.ts").BookmarkEntry} createBookmark
 * @prop {() => boolean} canSaveLocalBookmark
 * @prop {() => import("./bookmarkDatabase.js").default | undefined} getLocalBookmarkDatabase
 * @prop {(bookmark: import("./databaseSchema.d.ts").BookmarkEntry) => Promise<void>} saveLocalBookmark
 */

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
        bookmark.plots = options.plots.slice();
    }

    return bookmark;
}

/**
 * @param {import("../app.js").default} app
 * @returns {PlotBookmarkContext}
 */
export function createPlotBookmarkContext(app) {
    return {
        canSaveLocalBookmark: () => !!app.localBookmarkDatabase,
        getLocalBookmarkDatabase: () => app.localBookmarkDatabase,
        createBookmark: (plots) =>
            createBookmarkWithCurrentState(app, {
                plots,
            }),
        saveLocalBookmark: (bookmark) =>
            app.localBookmarkDatabase.put(bookmark),
    };
}
