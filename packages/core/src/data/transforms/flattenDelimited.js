import { asArray } from "../../utils/arrayUtils.js";
import { BEHAVIOR_CLONES } from "../flowNode.js";
import Transform from "./transform.js";

export default class FlattenDelimitedTransform extends Transform {
    get behavior() {
        return BEHAVIOR_CLONES;
    }

    /**
     * @param {import("../../spec/transform.js").FlattenDelimitedParams} params
     * @param {import("../flowNode.js").ParamRuntimeProvider} [paramRuntimeProvider]
     */
    constructor(params, paramRuntimeProvider) {
        super(params, paramRuntimeProvider);

        // TODO: Validate config. string elements, etc...

        const accessors = this.createFieldAccessors(params, "field");
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
            const flatLen = splitFields[0].length;
            for (let fi = 1; fi < splitFields.length; fi++) {
                if (splitFields[fi].length !== flatLen) {
                    throw new Error(
                        "Mismatching number of elements in the fields to be split: " +
                            JSON.stringify(datum)
                    );
                }
            }

            for (let ri = 0; ri < flatLen; ri++) {
                /** @type {import("../flowNode.js").Datum} */
                const newRow = Object.assign({}, datum);
                for (let fi = 0; fi < accessors.length; fi++) {
                    newRow[as[fi]] = splitFields[fi][ri];
                }
                this._propagate(newRow);
            }
        };
    }
}
