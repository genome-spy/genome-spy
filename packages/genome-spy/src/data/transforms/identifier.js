import FlowNode, { BEHAVIOR_MODIFIES } from "../flowNode";

const DEFAULT_AS = "_uniqueId";

const BLOCK_SIZE = 10000;

/**
 * TODO: The reservation map should be bound to GenomeSpy instances.
 * Because it's now global, there's a higher risk that we run out of ids.
 *
 * TODO: Identifier transforms should be removed from the reservation map
 * when a transform is removed from the flow.
 *
 * The first block is reserved for "none".
 *
 * @type {IdentifierTransform[]}
 */
const reservationMap = [null];

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

        /**
         * The number of blocks used
         */
        this._usedBlocks = 0;

        /**
         * The next advancement allocates the initial block
         */
        this._id = -1;
    }

    initialize() {
        //
    }

    reset() {
        super.reset();

        this._usedBlocks = 0;
        this._id = -1;
    }

    /**
     *
     * @param {import("../flowNode").Datum} datum
     */
    handle(datum) {
        datum[this.as] = this._nextId();
        this._propagate(datum);
    }

    /**
     * @returns {number}
     */
    _nextId() {
        let next = this._id++;
        if (next % BLOCK_SIZE == 0) {
            this._id = this._getBlock() * BLOCK_SIZE;
            return this._id++;
        }
        return next;
    }

    _getBlock() {
        if (this._usedBlocks < this._blocks.length - 1) {
            return this._blocks[this._usedBlocks++];
        }

        return this._reserveBlock();
    }

    _reserveBlock() {
        const blockId = reservationMap.length;
        reservationMap[blockId] = this;
        this._blocks.push(blockId);

        return blockId;
    }
}
