import { DBSchema } from "idb";
import { ChromosomalLocus } from "@genome-spy/core/genome/genome";
import { ViewSettings } from "./state";
import { Action } from "./state/provenance";

interface BookmarkEntry {
    name: string;
    timestamp: number;

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
    viewSettings?: ViewSettings;
}
interface BookmarkDB extends DBSchema {
    bookmarks: {
        value: BookmarkEntry;
        key: string;
    };
}
