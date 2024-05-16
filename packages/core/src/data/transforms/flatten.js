import { asArray } from "../../utils/arrayUtils.js";
import { field } from "../../utils/field.js";
import { BEHAVIOR_CLONES } from "../flowNode.js";
import Transform from "./transform.js";

export default class FlattenTransform extends Transform {
    get behavior() {
        return BEHAVIOR_CLONES;
    }

    /**
     * @param {import("../../spec/transform.js").FlattenParams} params
     */
    constructor(params) {
        super();

        const indexField = params.index;

        if (params.fields) {
            const accessors = asArray(params.fields).map((f) => field(f));
            const as = asArray(params.as || params.fields);

            if (accessors.length !== as.length) {
                throw new Error(
                    `Lengths of "fields" (${accessors.length}), and "as" (${as.length}) do not match!`
                );
            }

            /** @param {any[]} datum */
            this.handle = (datum) => {
                // TODO: Check that the field contains an array
                const accessedFields = accessors.map(
                    (accessor, i) => accessor(datum) ?? []
                );

                const maxLen = accessedFields[0].length;

                for (let ri = 0; ri < maxLen; ri++) {
                    // TODO: use objectCloner for extra performance
                    /** @type {import("../flowNode.js").Datum} */
                    const newRow = Object.assign({}, datum);
                    for (let fi = 0; fi < accessors.length; fi++) {
                        newRow[as[fi]] =
                            ri < accessedFields[fi].length
                                ? accessedFields[fi][ri]
                                : null;
                    }
                    if (indexField) {
                        newRow[indexField] = ri;
                    }
                    this._propagate(newRow);
                }
            };
        } else {
            /** @param {any[]} datum */
            this.handle = (datum) => {
                // TODO: Check that the object is an array
                for (let i = 0; i < datum.length; i++) {
                    /** @type {import("../flowNode.js").Datum} */
                    const newRow = Object.assign({}, datum[i]);
                    if (indexField) {
                        newRow[indexField] = i;
                    }
                    this._propagate(newRow);
                }
            };
        }
    }
}
