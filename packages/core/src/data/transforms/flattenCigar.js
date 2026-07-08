import { field } from "../../utils/field.js";
import { createCachedCloner } from "../../utils/cloner.js";
import { BEHAVIOR_CLONES } from "../flowNode.js";
import { walkCigar } from "./cigarUtils.js";
import Transform from "./transform.js";

export default class FlattenCigarTransform extends Transform {
    get behavior() {
        return BEHAVIOR_CLONES;
    }

    /**
     * @param {import("../../spec/transform.js").FlattenCigarParams} params
     */
    constructor(params) {
        super(params);

        const startAccessor = field(params.start ?? "start");
        const cigarAccessor = field(params.cigar ?? "cigar");
        const clone = createCachedCloner({ copyFields: params.copyFields });

        /** @param {Record<string, any>} datum */
        this.handle = (datum) => {
            const start = startAccessor(datum);
            if (!Number.isFinite(start)) {
                throw new Error(`Invalid CIGAR start coordinate: ${start}`);
            }

            const cigar = cigarAccessor(datum);
            if (typeof cigar !== "string" || cigar.length == 0) {
                throw new Error(
                    `Malformed CIGAR string: ${JSON.stringify(cigar)}`
                );
            }

            for (const operation of walkCigar(cigar, start)) {
                this._propagate(Object.assign(clone(datum), operation));
            }
        };

        this.beginBatch = (flowBatch) => {
            clone.reset();
            super.beginBatch(flowBatch);
        };
    }
}
