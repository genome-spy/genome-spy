import { DBSchema } from "idb";
import { ChromosomalLocus } from "@genome-spy/core/genome/genome.js";
import { ViewSettingsPayload } from "../state.js";
import { Action } from "../state/provenance.js";

export interface BookmarkEntry {
    name: string;
    timestamp?: number;

    notes?: string;

    /**
     * Provenance
     */
    actions?: Action[];

    /**
     * Domains of scales that are both zoomable and named
     */
    scaleDomains?: Record<string, number[] | ChromosomalLocus[]>;

    /**
     * Settings such as view visibilities
     */
    viewSettings?: ViewSettingsPayload;
}

export interface BookmarkDB extends DBSchema {
    bookmarks: {
        value: BookmarkEntry;
        key: string;
    };
}
