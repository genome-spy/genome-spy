/**
 * An abstract base class for bookmark databases
 */
export default class BookmarkDatabase {
    /**
     * @returns true if this database implementation is mutable
     */
    isReadonly() {
        return true;
    }

    /**
     * @param {import("./databaseSchema.js").BookmarkEntry} entry
     * @param {string} [nameToReplace]
     */
    async put(entry, nameToReplace) {
        this._checkReadonly();
        // Not implemented
    }

    /**
     * @param {string} name
     */
    async delete(name) {
        this._checkReadonly();
        // Not implemented
    }

    /**
     * @returns {Promise<string[]>}
     */
    async getNames() {
        return []; // Not implemented
    }

    /**
     *
     * @param {string} name
     * @returns {Promise<import("./databaseSchema.js").BookmarkEntry>}
     */
    async get(name) {
        return undefined;
    }

    _checkReadonly() {
        if (this.isReadonly()) {
            throw new Error("This bookmark");
        }
    }
}
