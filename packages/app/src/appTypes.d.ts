import { BookmarkEntry } from "./bookmark/databaseSchema.js";

export type UrlHash = Partial<BookmarkEntry>;

export interface DependencyQueryDetails {
    /** Name of the queried dependency */
    name: string;
    /** Callback that will set the dependency. */
    setter: (dependency: any) => void;
}

export type DependencyQueryEvent = CustomEvent<DependencyQueryDetails>;
