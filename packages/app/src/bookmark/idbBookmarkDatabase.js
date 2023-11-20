import { openDB } from "idb";
import BookmarkDatabase from "./bookmarkDatabase.js";

const BOOKMARKS_STORE = "bookmarks";

/**
 * @typedef {import("../state/provenance.js").Action} Action
 */

/**
 * A bookmark database based on IndexedDB
 */
export default class IDBBookmarkDatabase extends BookmarkDatabase {
    /**
     *
     * @param {string} specId
     */
    constructor(specId) {
        super();

        this.specId = specId;

        /** @type {Promise<import("idb").IDBPDatabase<import("./databaseSchema.js").BookmarkDB>>} */
        this._db = undefined;
    }

    async _getDB() {
        // TODO: Only create the initial database if a new bookmark is being added.
        if (!this._db) {
            // We create a different database for each spec. Rationale: if an origin
            // uses multiple GenomeSpy versions, a single shared database would likely to
            // be a problem when the schema needs to be changed.
            const dbName = `GenomeSpy: ${this.specId}`;

            this._db = openDB(dbName, 1, {
                upgrade(db, oldVersion, newVersion, transaction) {
                    // eslint-disable-next-line no-unused-vars
                    const store = db.createObjectStore(BOOKMARKS_STORE, {
                        keyPath: "name",
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
                },
            });
        }

        return this._db;
    }

    isReadonly() {
        return false;
    }

    /**
     * @param {import("./databaseSchema.js").BookmarkEntry} entry
     * @param {string} [nameToReplace]
     */
    async put(entry, nameToReplace) {
        const db = await this._getDB();

        const tx = db.transaction(BOOKMARKS_STORE, "readwrite");
        try {
            if (nameToReplace) {
                await tx.store.delete(nameToReplace);
                await tx.store.put(entry);
            } else {
                await tx.store.put(entry);
            }
            await tx.done;
        } catch (error) {
            tx.abort();
            throw error;
        }
    }

    /**
     * @param {string} name
     */
    async delete(name) {
        const db = await this._getDB();
        db.delete(BOOKMARKS_STORE, name);
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
