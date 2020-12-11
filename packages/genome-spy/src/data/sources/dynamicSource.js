import DataSource from "./dataSource";

/**
 * @param {Partial<import("../../spec/data").Data>} data
 * @returns {data is import("../../spec/data").DynamicData}
 */
export function isDynamicData(data) {
    return "dynamicSource" in data;
}

export default class DynamicSource extends DataSource {
    /**
     *
     * @param {Iterable<any>} iterable
     */
    publishData(iterable) {
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
        // nop
    }
}
