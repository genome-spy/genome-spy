import FlowNode, { BEHAVIOR_CLONES } from "../flowNode";

/**
 * Folds fields using a regex
 *
 * TODO: Support multiple regexes and target fields
 *
 * See: https://vega.github.io/vega/docs/transforms/fold/
 *
 * @typedef {import("../../spec/transform").GatherConfig} GatherConfig
 */
export default class RegexFoldTransform extends FlowNode {
    get behavior() {
        return BEHAVIOR_CLONES;
    }

    /**
     * @param {GatherConfig} params
     */
    constructor(params) {
        super();

        const columnRegex = new RegExp(params.columnRegex);

        const sampleKey = params.asKey || "sample";
        const as = params.asValue;

        /** @type {string[]} */
        const propCache = [];
        /** @type {string[]} */
        const matchCache = [];

        // Prevent JavaScript engine from doing deoptimizations etc. when
        // an out-of-bounds index is being accessed.
        for (let i = 0; i < 1000; i++) {
            propCache.push(undefined);
            matchCache.push(undefined);
        }

        /**
         *
         * @param {any} datum
         */
        this.handle = datum => {
            // Save memory by skipping the columns being gathered
            /** @type {Record<string, any>} */
            const strippedRow = {};
            for (const prop in datum) {
                if (!columnRegex.test(prop)) {
                    strippedRow[prop] = datum[prop];
                }
            }

            let propIndex = 0;
            // eslint-disable-next-line guard-for-in
            for (const prop in datum) {
                let sampleId;

                if (propCache[propIndex] == prop) {
                    sampleId = matchCache[propIndex];
                } else {
                    const match = columnRegex.exec(prop);
                    sampleId = match?.[1];
                    propCache[propIndex] = prop;
                    matchCache[propIndex] = sampleId;
                }
                propIndex++;

                if (sampleId !== undefined) {
                    const tidyRow = Object.assign({}, strippedRow);
                    tidyRow[sampleKey] = sampleId;
                    tidyRow[as] = datum[prop];
                    this._propagate(tidyRow);
                }
            }
        };
    }
}
