import DataSource from "./dataSource";

/**
 * @param {Partial<import("../../spec/data").Data>} data
 * @returns {data is import("../../spec/data").InlineData}
 */
export function isDynamicData(data) {
    return "dynamicSource" in data;
}

export default class DynamicSource extends DataSource {
    /**
     * @param {function():Iterable<any>} callback Function that provides the data
     */
    constructor(callback) {
        super();

        this.callback = callback;
    }

    loadSynchronously() {
        const iterable = this.callback();

        if (!iterable || typeof iterable[Symbol.iterator] !== "function") {
            throw new Error("Dynamic data source didn't return iterable data!");
        }

        this.reset();

        let wrap;

        for (const d of iterable) {
            if (!wrap) {
                wrap = typeof d != "object" ? x => ({ data: x }) : x => x;
            }

            this._propagate(wrap(d));
        }

        this.complete();
    }

    async load() {
        this.loadSynchronously();
    }
}
