import DataSource from "./dataSource";

/**
 * @param {Partial<import("../../spec/data").Data>} data
 * @returns {data is import("../../spec/data").DynamicCallbackData}
 */
export function isDynamicCallbackData(data) {
    return "dynamicCallbackSource" in data;
}

/**
 * A data source that retrieves the data from a callback that returns an iterable.
 */
export default class DynamicCallbackSource extends DataSource {
    /**
     * @param {function():Iterable<any>} [callback] Function that provides the data
     */
    constructor(callback) {
        super();

        this.callback = callback;
    }

    loadSynchronously() {
        if (!this.callback) {
            return;
        }

        const iterable = this.callback();

        if (!iterable || typeof iterable[Symbol.iterator] !== "function") {
            throw new Error(
                "Dynamic data callback didn't return iterable data!"
            );
        }

        this.reset();
        this.beginBatch({ type: "file" });

        let wrap;

        for (const d of iterable) {
            if (!wrap) {
                wrap = typeof d != "object" ? (x) => ({ data: x }) : (x) => x;
            }

            this._propagate(wrap(d));
        }

        this.complete();
    }

    async load() {
        this.loadSynchronously();
    }
}
