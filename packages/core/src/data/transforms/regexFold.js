import { asArray } from "../../utils/arrayUtils.js";
import FlowNode, { BEHAVIOR_CLONES, isFileBatch } from "../flowNode.js";

/**
 * Folds fields using a regex
 *
 * See: https://vega.github.io/vega/docs/transforms/fold/
 */
export default class RegexFoldTransform extends FlowNode {
    get behavior() {
        return BEHAVIOR_CLONES;
    }

    /**
     * @param {import("../../spec/transform").RegexFoldParams} params
     */
    constructor(params) {
        super();

        const columnRegex = asArray(params.columnRegex).map(
            (re) => new RegExp(re)
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

        /** @type {(datum: any, sampleId: string) => Record<string, any>} */
        let create;

        /**
         * @param {any} datum
         */
        const detectColumns = (datum) => {
            const colNames = /** @type {string[]} */ (Object.keys(datum));

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
                (colName) =>
                    !columnRegex.some((re) => re.test(colName)) &&
                    !(skipRegex && skipRegex.test(colName))
            );

            const props = [
                ...includedColumns.map(
                    (prop) =>
                        JSON.stringify(prop) +
                        ": datum[" +
                        JSON.stringify(prop) +
                        "]"
                ),
                JSON.stringify(sampleKey) + ": sampleId",
                ...as.map((a) => JSON.stringify(a) + ": null"),
            ];

            // eslint-disable-next-line no-new-func
            create = /** @type {any} */ (
                new Function(
                    "datum",
                    "sampleId",
                    "return {\n" + props.join(",\n") + "\n};"
                )
            );
        };

        /**
         * @param {any} datum
         */
        const doRegexFold = (datum) => {
            if (!sampleAttrs) {
                detectColumns(datum);
            }

            for (const [sampleId, attrs] of sampleAttrs) {
                const tidyRow = create(datum, sampleId);
                for (let i = 0; i < attrs.length; i++) {
                    tidyRow[as[i]] = datum[attrs[i]];
                }

                this._propagate(tidyRow);
            }
        };

        /**
         * @param {any} datum
         */
        const detectAndHandle = (datum) => {
            detectColumns(datum);
            doRegexFold(datum);
            this.handle = doRegexFold;
        };

        this.handle = detectAndHandle;

        /**
         *
         * @param {import("../../types/flowBatch").FlowBatch} flowBatch
         */
        this.beginBatch = (flowBatch) => {
            if (isFileBatch(flowBatch)) {
                this.handle = detectAndHandle;
            }
            super.beginBatch(flowBatch);
        };
    }
}
