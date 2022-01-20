import { RootSpec } from "@genome-spy/core/spec/root";

export interface RemoteBookmarkConfig {
    url: string;

    /**
     * Should the user be shown a tour of the remote bookmarks when the visualization
     * is launched? If the `initialBookmark` property is not defined, the tour starts
     * from the first bookmark.
     */
    tour?: boolean;

    /**
     * Name of the bookmark that should be loaded as the initial state. A message box
     * is shown only if the `tour` property is set to `true`.
     */
    initialBookmark?: string;
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

export type AppRootSpec = RootSpec & AppRootConfig;
