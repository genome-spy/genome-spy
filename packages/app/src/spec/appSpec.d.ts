import { RootSpec } from "@genome-spy/core/spec/root";

interface AppRootConfig {
    /**
     * A unique identifier that is used in storing state bookmarks to browser's
     * IndexedDB. This is needed to make distinction between visualizations that
     * are served from the same origin, i.e., the same host and port.
     */
    specId?: string;
}

export type AppRootSpec = RootSpec & AppRootConfig;
