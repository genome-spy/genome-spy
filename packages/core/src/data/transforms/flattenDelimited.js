import { asArray } from "../../utils/arrayUtils";
import { field } from "../../utils/field";
import FlowNode, { BEHAVIOR_CLONES } from "../flowNode";

export default class FlattenDelimitedTransform extends FlowNode {
    get behavior() {
        return BEHAVIOR_CLONES;
    }

    /**
     * @param {import("../../spec/transform").FlattenDelimitedParams} params
     */
    constructor(params) {
        super();

        // TODO: Validate config. string elements, etc...

        const accessors = asArray(params.field).map((f) => field(f));
        const separators = asArray(params.separator);
        const as = asArray(params.as || params.field);

        if (
            accessors.length !== separators.length ||
            accessors.length !== as.length
        ) {
            throw new Error(
                `Lengths of "separator" (${separators.length}), "fields" (${accessors.length}), and "as" (${as.length}) do not match!`
            );
        }

        /** @param {any[]} datum */
        this.handle = (datum) => {
            if (accessors.some((a) => !a(datum))) return;

            const splitFields = accessors.map((accessor, i) =>
                accessor(datum).split(separators[i])
            );
            validateSplit(splitFields, datum);
            const flatLen = splitFields[0].length;

            for (let ri = 0; ri < flatLen; ri++) {
                /** @type {import("../flowNode").Datum} */
                const newRow = Object.assign({}, datum);
                for (let fi = 0; fi < accessors.length; fi++) {
                    newRow[as[fi]] = splitFields[fi][ri];
                }
                this._propagate(newRow);
            }
        };
    }
}

/**
 *
 * @param {any[]} splitFields
 * @param {unknown} row
 */
function validateSplit(splitFields, row) {
    const splitLengths = splitFields.map((f) => f.length);
    if (!splitLengths.every((x) => x == splitLengths[0])) {
        throw new Error(
            "Mismatching number of elements in the fields to be split: " +
                JSON.stringify(row)
        );
    }
}
