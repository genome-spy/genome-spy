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
     * @param {import("../flowNode.js").ParamRuntimeProvider} [paramRuntimeProvider]
     */
    constructor(params, paramRuntimeProvider) {
        super(params, paramRuntimeProvider);

        const startAccessor = this.createFieldAccessor(params, "start", {
            defaultValue: "start",
        });
        const cigarAccessor = this.createFieldAccessor(params, "cigar", {
            defaultValue: "cigar",
        });
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

        /** @param {import("../../types/flowBatch.js").FlowBatch} flowBatch */
        this.beginBatch = (flowBatch) => {
            clone.reset();
            super.beginBatch(flowBatch);
        };
    }
}
