import { DBSchema } from "idb";
import { Action } from "./provenance";

interface BookmarkDB extends DBSchema {
    bookmarks: {
        value: {
            name: string;
            timestamp: number;
            actions: Action[];
        };
        key: string;
    };
}
