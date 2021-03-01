import { openDB } from "idb";

const BOOKMARKS_STORE = "bookmarks";

/**
 * @typedef {import("./provenance").Action} Action
 */
export default class BookmarkDatabase {
    constructor() {
        /** @type {import("idb").IDBPDatabase<import("./databaseSchema").BookmarkDB>} */
        this._db = undefined;
    }

    // eslint-disable-next-line require-await
    async _getDB() {
        if (!this._db) {
            this._db = openDB("provenanceBookmarks", 1, {
                upgrade(db, oldVersion, newVersion, transaction) {
                    const store = db.createObjectStore(BOOKMARKS_STORE, {
                        keyPath: "name"
                    });
                },
                blocked() {
                    // …
                },
                blocking() {
                    // …
                },
                terminated() {
                    // …
                }
            });
        }

        return this._db;
    }

    /**
     * @param {string} name
     * @param {Action[]} actions
     */
    async add(name, actions) {
        const db = await this._getDB();
        await db.put(BOOKMARKS_STORE, {
            name,
            timestamp: Date.now(),
            actions
        });
    }

    async getNames() {
        const db = await this._getDB();
        return db.getAllKeys(BOOKMARKS_STORE);
    }

    /**
     *
     * @param {string} name
     */
    async get(name) {
        const db = await this._getDB();
        return db.get(BOOKMARKS_STORE, name);
    }
}
