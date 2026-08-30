import { BEHAVIOR_COLLECTS, BEHAVIOR_MODIFIES } from "../flowNode.js";
import { field } from "../../utils/field.js";
import Transform from "./transform.js";

const DEFAULT_HALF_LIFE = 80;
const DEFAULT_EPSILON = 0.01;

/**
 * Smooths numeric fields between keyed dataflow updates.
 */
export default class TransitionTransform extends Transform {
    /** @type {import("../flowNode.js").Datum[]} */
    #data = [];

    /** @type {{ index: number, flowBatch: import("../../types/flowBatch.js").FlowBatch }[]} */
    #batchStarts = [];

    /** @type {Map<string | number, TransitionState>} */
    #states = new Map();

    #animationRequested = false;

    /** @type {number | undefined} */
    #lastTimestamp;

    get behavior() {
        return BEHAVIOR_COLLECTS | BEHAVIOR_MODIFIES;
    }

    /**
     * @param {import("../../spec/transform.js").TransitionParams} params
     * @param {import("../flowNode.js").ParamRuntimeProvider} paramRuntimeProvider
     */
    constructor(params, paramRuntimeProvider) {
        super(params, paramRuntimeProvider);

        validateParams(params);
        this.params = params;
        this.keyAccessor = field(params.key);
        this.accessors = params.fields.map((name) => field(name));
        this.as = params.as ?? params.fields;
        this.halfLife = params.halfLife ?? DEFAULT_HALF_LIFE;
        this.epsilon = params.epsilon ?? DEFAULT_EPSILON;

        const animator = paramRuntimeProvider?.context?.animator;
        if (!animator) {
            throw new Error("transition requires an animator.");
        }
        this.animator = animator;
        this.registerDisposer(() => {
            this.animator.cancelTransition(this.#animate);
            this.#animationRequested = false;
        });
    }

    reset() {
        super.reset();
        this.#data = [];
        this.#batchStarts = [];
    }

    /**
     * @param {import("../../types/flowBatch.js").FlowBatch} flowBatch
     */
    beginBatch(flowBatch) {
        this.#batchStarts.push({ index: this.#data.length, flowBatch });
        super.beginBatch(flowBatch);
    }

    /**
     * @param {import("../flowNode.js").Datum} datum
     */
    handle(datum) {
        this.#data.push(datum);
    }

    complete() {
        const nextStates = new Map();
        let unsettled = false;

        for (const datum of this.#data) {
            const key = this.keyAccessor(datum);
            validateKey(key);
            if (nextStates.has(key)) {
                throw new Error(`transition key must be unique: ${key}`);
            }

            const target = this.accessors.map((accessor) => accessor(datum));
            validateTarget(target, key);
            const previous = this.#states.get(key);
            const current = previous ? previous.current : target.slice();
            const state = { current, target, datum };
            nextStates.set(key, state);

            if (
                this.animator.transitionsEnabled === false ||
                maxDifference(current, target) <= this.epsilon
            ) {
                state.current = target.slice();
            } else {
                unsettled = true;
            }
            writeValues(state.datum, this.as, state.current);
        }

        this.#states = nextStates;
        for (const datum of this.#data) {
            this._propagate(datum);
        }
        super.complete();

        if (unsettled) {
            this.#requestAnimation();
        } else {
            this.#stopAnimation();
        }
    }

    #requestAnimation() {
        if (!this.#animationRequested) {
            this.#animationRequested = true;
            this.animator.requestTransition(this.#animate);
        }
    }

    #stopAnimation() {
        this.animator.cancelTransition(this.#animate);
        this.#animationRequested = false;
        this.#lastTimestamp = undefined;
    }

    /** @param {number} timestamp */
    #animate = (timestamp) => {
        this.#animationRequested = false;
        if (this.disposed) {
            return;
        }

        const elapsed =
            this.#lastTimestamp === undefined
                ? 0
                : timestamp - this.#lastTimestamp;
        this.#lastTimestamp = timestamp;
        const remainder = Math.pow(2, -elapsed / this.halfLife);
        let maxDiff = 0;

        for (const state of this.#states.values()) {
            for (let i = 0; i < state.target.length; i++) {
                state.current[i] =
                    state.target[i] +
                    (state.current[i] - state.target[i]) * remainder;
                maxDiff = Math.max(
                    maxDiff,
                    Math.abs(state.target[i] - state.current[i])
                );
            }
        }

        if (maxDiff <= this.epsilon) {
            for (const state of this.#states.values()) {
                state.current = state.target.slice();
            }
            this.#lastTimestamp = undefined;
        }

        for (const state of this.#states.values()) {
            writeValues(state.datum, this.as, state.current);
        }
        this.#replayChildren();

        if (maxDiff > this.epsilon) {
            this.#requestAnimation();
        }
    };

    #replayChildren() {
        for (const child of this.children) {
            child.reset();
        }

        let batchIndex = 0;
        for (let i = 0; i <= this.#data.length; i++) {
            while (this.#batchStarts[batchIndex]?.index == i) {
                const { flowBatch } = this.#batchStarts[batchIndex++];
                for (const child of this.children) {
                    child.beginBatch(flowBatch);
                }
            }
            if (i < this.#data.length) {
                this._propagate(this.#data[i]);
            }
        }

        for (const child of this.children) {
            child.complete();
        }
    }
}

/**
 * @typedef {object} TransitionState
 * @prop {number[]} current
 * @prop {number[]} target
 * @prop {import("../flowNode.js").Datum} datum
 */

/** @param {import("../../spec/transform.js").TransitionParams} params */
function validateParams(params) {
    const as = params.as ?? params.fields;
    if (typeof params.key != "string") {
        throw new Error("transition key must be a field name.");
    }
    if (
        !Array.isArray(params.fields) ||
        params.fields.length == 0 ||
        params.fields.some((name) => typeof name != "string") ||
        new Set(params.fields).size != params.fields.length
    ) {
        throw new Error("transition fields must contain distinct field names.");
    }
    if (
        !Array.isArray(as) ||
        as.length != params.fields.length ||
        as.some((name) => typeof name != "string") ||
        new Set(as).size != as.length ||
        as.includes(params.key)
    ) {
        throw new Error(
            "transition as must contain distinct output fields and preserve the key."
        );
    }
    if (
        params.halfLife !== undefined &&
        (!Number.isFinite(params.halfLife) || params.halfLife <= 0)
    ) {
        throw new Error(
            "transition halfLife must be a positive finite number."
        );
    }
    if (
        params.epsilon !== undefined &&
        (!Number.isFinite(params.epsilon) || params.epsilon <= 0)
    ) {
        throw new Error("transition epsilon must be a positive finite number.");
    }
}

/** @param {any} key */
function validateKey(key) {
    if (
        typeof key != "string" &&
        !(typeof key == "number" && Number.isFinite(key))
    ) {
        throw new Error("transition keys must be strings or finite numbers.");
    }
}

/** @param {any[]} target @param {string | number} key */
function validateTarget(target, key) {
    if (target.some((value) => !Number.isFinite(value))) {
        throw new Error(
            `transition targets must be finite numbers (key ${key}).`
        );
    }
}

/** @param {number[]} current @param {number[]} target */
function maxDifference(current, target) {
    let maxDiff = 0;
    for (let i = 0; i < target.length; i++) {
        maxDiff = Math.max(maxDiff, Math.abs(target[i] - current[i]));
    }
    return maxDiff;
}

/**
 * @param {import("../flowNode.js").Datum} datum
 * @param {string[]} fields
 * @param {number[]} values
 */
function writeValues(datum, fields, values) {
    for (let i = 0; i < fields.length; i++) {
        datum[fields[i]] = values[i];
    }
}
