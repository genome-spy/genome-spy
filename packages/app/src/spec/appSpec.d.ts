import { RootSpec } from "@genome-spy/core/spec/root";

export interface RemoteBookmarkConfig {
    url: string;

    /**
     * Should the user be shown a tour of the remote bookmarks when the visualization
     * is launched?
     */
    tour?: boolean;
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
