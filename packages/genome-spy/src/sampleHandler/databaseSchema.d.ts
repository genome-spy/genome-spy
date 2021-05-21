import { DBSchema } from "idb";
import { ChromosomalLocus } from "../genome/genome";
import { Action } from "./provenance";

interface BookmarkEntry {
    name: string;
    timestamp: number;
    actions: Action[];
    // TODO: Support complex views and zoomable y-axis etc.
    // Now we assume that there's a single shared scale resolution (x).
    zoom?: (number | ChromosomalLocus)[];
}
interface BookmarkDB extends DBSchema {
    bookmarks: {
        value: BookmarkEntry;
        key: string;
    };
}
