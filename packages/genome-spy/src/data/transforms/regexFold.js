import { asArray } from "../../utils/arrayUtils";
import FlowNode, { BEHAVIOR_CLONES } from "../flowNode";

/**
 * Folds fields using a regex
 *
 * See: https://vega.github.io/vega/docs/transforms/fold/
 *
 * @typedef {import("../../spec/transform").RegexFoldParams} RegexFoldParams
 */
export default class RegexFoldTransform extends FlowNode {
    get behavior() {
        return BEHAVIOR_CLONES;
    }

    /**
     * @param {RegexFoldParams} params
     */
    constructor(params) {
        super();

        const columnRegex = asArray(params.columnRegex).map(
            re => new RegExp(re)
        );
        // TODO: Consider using named groups
        const as = asArray(params.asValue);

        if (columnRegex.length != as.length) {
            throw new Error('Lengths of "columnRegex" and "as" are not equal!');
        }

        const skipRegex = params.skipRegex
            ? new RegExp(params.skipRegex)
            : undefined;

        const sampleKey = params.asKey || "sample";

        /** @type {[string, string[]][]} */
        let sampleAttrs;

        /** @type {string[]} */
        let includedColumns;

        /** @type {function(any):any} */
        let createOrCopy = datum => Object.assign({}, datum);

        /**
         * @param {any} datum
         */
        const detectColumns = datum => {
            const colNames = Object.keys(datum);

            /** @type {Map<string, string[]>} */
            const sampleColMap = new Map();

            for (const [i, re] of columnRegex.entries()) {
                for (const colName of colNames) {
                    const sampleId = re.exec(colName)?.[1];
                    if (sampleId !== undefined) {
                        let attrs = sampleColMap.get(sampleId);
                        if (!attrs) {
                            attrs = [];
                            sampleColMap.set(sampleId, attrs);
                        }

                        attrs[i] = colName;
                    }
                }
            }

            sampleAttrs = [...sampleColMap.entries()];

            includedColumns = colNames.filter(
                colName =>
                    !columnRegex.some(re => re.test(colName)) &&
                    !(skipRegex && skipRegex.test(colName))
            );

            // Copying large objects is slow, accessing inherited objects is slow.
            // Choosing copying strategy based on the number of columns. The threshold
            // is chosen randomly.
            createOrCopy =
                includedColumns.length > 10
                    ? d => Object.create(d)
                    : d => Object.assign({}, d);
        };

        /**
         * @param {any} datum
         */
        const doRegexFold = datum => {
            if (!sampleAttrs) {
                detectColumns(datum);
            }

            // Save memory by skipping the columns being gathered
            /** @type {Record<string, any>} */
            const strippedRow = {};
            for (const prop of includedColumns) {
                strippedRow[prop] = datum[prop];
            }

            for (const [sampleId, attrs] of sampleAttrs) {
                const tidyRow = createOrCopy(strippedRow);

                tidyRow[sampleKey] = sampleId;

                for (let i = 0; i < attrs.length; i++) {
                    tidyRow[as[i]] = datum[attrs[i]];
                }

                this._propagate(tidyRow);
            }
        };

        /**
         * @param {any} datum
         */
        const detectAndHandle = datum => {
            detectColumns(datum);
            doRegexFold(datum);
            this.handle = doRegexFold;
        };

        this.handle = detectAndHandle;

        /**
         *
         * @param {import("../flowNode").BatchMetadata} metadata
         */
        this.beginBatch = metadata => {
            this.handle = detectAndHandle;
            super.beginBatch(metadata);
        };
    }
}
