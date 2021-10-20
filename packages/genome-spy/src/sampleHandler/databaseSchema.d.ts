import { DBSchema } from "idb";
import { ChromosomalLocus } from "../genome/genome";
import { Action } from "./provenance";

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
}
interface BookmarkDB extends DBSchema {
    bookmarks: {
        value: BookmarkEntry;
        key: string;
    };
}
