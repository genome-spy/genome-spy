import FlowNode, { BEHAVIOR_MODIFIES } from "../flowNode";

const DEFAULT_AS = "_uniqueId";

const BLOCK_SIZE = 100000;

/**
 * TODO: The reservation map should be bound to GenomeSpy instances.
 * Because it's now global, there's a higher risk that we run out of ids.
 *
 * @type {IdentifierTransform[]}
 */
const reservationMap = [];

/**
 * Assigns unique identifiers for tuples that pass through this transform.
 *
 * The identifiers are reserved in equally sized blocks, allowing for
 * quick lookup of the IdentifierTransform instance that assigned the id.
 * This is mainly used for creating ids that can be used for picking, i.e.,
 * selecting rendered data items by hovering or clicking.
 *
 * @typedef {import("../../spec/transform").IdentifierParams} IdentifierParams
 */
export default class IdentifierTransform extends FlowNode {
    get behavior() {
        return BEHAVIOR_MODIFIES;
    }

    /**
     *
     * @param {IdentifierParams} params
     */
    constructor(params) {
        super();
        this.params = params;

        this.as = params.as ?? DEFAULT_AS;

        /**
         * The block indexes reserved by this transform instance.
         * @type {number[]}
         */
        this._blocks = [];

        this._id = 0;
    }

    initialize() {
        //
    }

    reset() {
        // TODO: Mark the allocated blocks undefined
        // TODO: Reuse the blocks that were previously reserved
    }

    /**
     *
     * @param {import("../flowNode").Datum} datum
     */
    handle(datum) {
        datum[this.as] = this._nextId();
        this._propagate(datum);
    }

    _nextId() {
        let next = this._id++;
        if (next % BLOCK_SIZE == 0) {
            this._id = this._reserveBlock();
            return this._id++;
        }
        return next;
    }

    _reserveBlock() {
        // TODO: Reuse blocks when the transform is reset.
        const blockId = reservationMap.length;
        reservationMap[blockId] = this;
        this._blocks.push(blockId);

        return blockId * BLOCK_SIZE;
    }
}
