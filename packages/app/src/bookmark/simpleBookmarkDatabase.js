import BookmarkDatabase from "./bookmarkDatabase.js";

/**
 * A simple readonly database that wraps an array of bookmark objects
 */
export default class SimpleBookmarkDatabase extends BookmarkDatabase {
    /**
     * @param {import("./databaseSchema").BookmarkEntry[]} bookmarks
     */
    constructor(bookmarks) {
        super();

        this.bookmarks = bookmarks;
        this.names = bookmarks.map((bookmark) => bookmark.name);
    }

    /**
     * @returns {Promise<string[]>}
     */
    async getNames() {
        return this.names;
    }

    /**
     * @param {string} name
     * @returns {Promise<import("./databaseSchema").BookmarkEntry>}
     */
    async get(name) {
        return this.bookmarks.find((bookmark) => bookmark.name == name);
    }
}
