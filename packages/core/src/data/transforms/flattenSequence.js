import { field } from "../../utils/field.js";
import { BEHAVIOR_CLONES } from "../flowNode.js";
import Transform from "./transform.js";

export default class FlattenSequenceTransform extends Transform {
    get behavior() {
        return BEHAVIOR_CLONES;
    }

    /**
     *
     * @param {import("../../spec/transform.js").FlattenSequenceParams} params
     */
    constructor(params) {
        super(params);

        this.params = params;

        const accessor = field(params.field ?? "sequence");
        const [asPos, asSequence] = params.as ?? ["pos", "sequence"];

        /** @param {any[]} datum */
        this.handle = (datum) => {
            // TODO: Use code generation
            const template = Object.assign({}, datum, {
                [asSequence]: "",
                [asPos]: 0,
            });
            const sequence = /** @type {string} */ (accessor(datum));
            for (let i = 0; i < sequence.length; i++) {
                const newObject = Object.assign({}, template);
                newObject[asPos] = i;
                newObject[asSequence] = sequence.charAt(i);
                this._propagate(newObject);
            }
        };
    }
}
