import { showEnterBookmarkInfoDialog } from "../components/dialogs/enterBookmarkDialog.js";
import { showMessageDialog } from "../components/generic/messageDialog.js";
import { showShareBookmarkDialog } from "../components/dialogs/shareBookmarkDialog.js";

/**
 * @param {import("./sampleAttributePlotTypes.d.ts").SampleAttributePlot} plot
 * @returns {import("../bookmark/databaseSchema.d.ts").BookmarkPlotAttachment}
 */
export function createPlotBookmarkAttachment(plot) {
    return {
        kind: "sample_attribute_plot",
        request: plot.request,
    };
}

/**
 * @param {import("../bookmark/bookmarkState.js").PlotBookmarkContext} bookmarkContext
 * @param {import("./sampleAttributePlotTypes.d.ts").SampleAttributePlot} plot
 */
export async function addPlotBookmark(bookmarkContext, plot) {
    const bookmarkDatabase = bookmarkContext.getLocalBookmarkDatabase();
    if (!bookmarkDatabase) {
        return;
    }

    const bookmark = bookmarkContext.createBookmark([
        createPlotBookmarkAttachment(plot),
    ]);
    if (await showEnterBookmarkInfoDialog(bookmarkDatabase, bookmark, "add")) {
        try {
            await bookmarkContext.saveLocalBookmark(bookmark);
        } catch (error) {
            showMessageDialog(`${error}`, {
                title: "Cannot save the bookmark!",
            });
        }
    }
}

/**
 * @param {import("../bookmark/bookmarkState.js").PlotBookmarkContext} bookmarkContext
 * @param {import("./sampleAttributePlotTypes.d.ts").SampleAttributePlot} plot
 */
export async function sharePlotBookmark(bookmarkContext, plot) {
    const bookmark = bookmarkContext.createBookmark([
        createPlotBookmarkAttachment(plot),
    ]);
    if (await showEnterBookmarkInfoDialog(undefined, bookmark, "share")) {
        showShareBookmarkDialog(bookmark, false);
    }
}
