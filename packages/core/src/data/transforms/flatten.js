import { asArray } from "../../utils/arrayUtils";
import { field } from "../../utils/field";
import FlowNode, { BEHAVIOR_CLONES } from "../flowNode";

export default class FlattenTransform extends FlowNode {
    get behavior() {
        return BEHAVIOR_CLONES;
    }

    /**
     * @param {import("../../spec/transform").FlattenParams} params
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
                    /** @type {import("../flowNode").Datum} */
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
                    /** @type {import("../flowNode").Datum} */
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
