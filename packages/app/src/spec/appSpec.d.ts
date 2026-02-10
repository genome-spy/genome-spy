import { RootConfig } from "@genome-spy/core/spec/root.js";
import { AppViewSpec } from "./view.js";

export interface RemoteBookmarkConfig {
    url: string;

    /**
     * Should the user be shown a tour of the remote bookmarks when the visualization
     * is launched? If the `initialBookmark` property is not defined, the tour starts
     * from the first bookmark.
     */
    tour?: boolean;

    /**
     * Name of the bookmark that should be loaded as the initial state. The bookmark
     * description dialog is shown only if the `tour` property is set to `true`.
     */
    initialBookmark?: string;

    /**
     * Name of the bookmark that should be loaded when the user ends the tour.
     * If `null`, the dialog will be closed and the current state is retained.
     * If undefined, the default state without any performed actions will be loaded.
     */
    afterTourBookmark?: string;
}

export interface BookmarkConfig {
    remote?: RemoteBookmarkConfig;
}

interface AppRootConfig {
    /**
     * A unique identifier that is used in storing state bookmarks to browser's
     * IndexedDB. This is needed to make distinction between visualizations that
     * are served from the same origin, i.e., the same host and port.
     */
    specId?: string;

    bookmarks?: BookmarkConfig;
}

export type AppRootSpec = AppViewSpec & RootConfig & AppRootConfig;
