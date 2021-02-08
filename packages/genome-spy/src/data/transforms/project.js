import { accessorName } from "vega-util";
import { field } from "../../utils/field";
import FlowNode, { BEHAVIOR_CLONES } from "../flowNode";

/**
 * @typedef {import("../../spec/transform").ProjectParams} ProjectParams
 */
export default class ProjectTransform extends FlowNode {
    get behavior() {
        return BEHAVIOR_CLONES;
    }

    /**
     *
     * @param {ProjectParams} params
     */
    constructor(params) {
        super();

        if (params.as && params.as.length != params.fields.length) {
            throw new Error(`"fields" and "as" have unequal lengths!`);
        }

        const accessors = params.fields.map(f => field(f));
        const as = params.as ? params.as : accessors.map(accessorName);

        /**
         * @param {any} datum
         */
        this.handle = datum => {
            /** @type {Record<string, any>} */
            const projected = {};
            for (let i = 0; i < accessors.length; i++) {
                projected[as[i]] = accessors[i](datum);
            }
            this._propagate(projected);
        };
    }
}
