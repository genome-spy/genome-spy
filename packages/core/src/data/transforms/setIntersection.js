import { field } from "../../utils/field.js";
import { BEHAVIOR_CLONES } from "../flowNode.js";
import Transform from "./transform.js";

/**
 * Computes exact set-intersection profiles and expands them across all
 * observed sets. Input order determines the stable order of sets and profiles.
 */
export default class SetIntersectionTransform extends Transform {
    get behavior() {
        return BEHAVIOR_CLONES;
    }

    /**
     * @param {import("../../spec/transform.js").SetIntersectionParams} params
     */
    constructor(params) {
        super(params);

        const elementFields = Array.isArray(params.element)
            ? params.element
            : [params.element];

        if (elementFields.length == 0) {
            throw new Error('"element" must contain at least one field.');
        }

        if (params.membership === "") {
            throw new Error('"membership" must name a non-empty field.');
        }

        this.elementAccessors = elementFields.map((fieldName) =>
            field(fieldName)
        );
        this.setAccessor = field(params.set);
        this.membershipAccessor = params.membership
            ? field(params.membership)
            : null;

        this.#initialize();
    }

    #initialize() {
        /** @type {Map<string | number | boolean, any>} */
        this.elementRoot = new Map();

        /** @type {Map<number, boolean>[]} */
        this.elements = [];

        /** @type {Map<string | number | boolean, number>} */
        this.setIndexes = new Map();

        /** @type {(string | number | boolean)[]} */
        this.sets = [];
    }

    reset() {
        super.reset();
        this.#initialize();
    }

    /**
     * @param {unknown} value
     * @param {string} role
     * @returns {asserts value is string | number | boolean}
     */
    #assertScalar(value, role) {
        const validType =
            typeof value == "string" ||
            typeof value == "number" ||
            typeof value == "boolean";

        if (
            !validType ||
            (typeof value == "number" && !Number.isFinite(value))
        ) {
            throw new Error(
                `The ${role} field must contain finite scalar values. Received: ${String(value)}`
            );
        }
    }

    /**
     * @param {unknown} value
     * @returns {boolean}
     */
    #normalizeMembership(value) {
        if (value === true || value === 1) {
            return true;
        } else if (value === false || value === 0) {
            return false;
        } else {
            throw new Error(
                `The membership field must contain true, false, 1, or 0. Received: ${String(value)}`
            );
        }
    }

    /**
     * @param {import("../flowNode.js").Datum} datum
     */
    #getMemberships(datum) {
        let node = this.elementRoot;
        const lastIndex = this.elementAccessors.length - 1;

        // Only compound keys need intermediate maps. The final key component
        // points directly to memberships, keeping single-field lookup flat.
        for (let i = 0; i < lastIndex; i++) {
            const value = this.elementAccessors[i](datum);
            this.#assertScalar(value, "element");
            let child = node.get(value);
            if (!child) {
                child = new Map();
                node.set(value, child);
            }
            node = child;
        }

        const lastValue = this.elementAccessors[lastIndex](datum);
        this.#assertScalar(lastValue, "element");
        let memberships = node.get(lastValue);
        if (!memberships) {
            memberships = new Map();
            node.set(lastValue, memberships);
            this.elements.push(memberships);
        }

        return /** @type {Map<number, boolean>} */ (memberships);
    }

    /**
     * @param {import("../flowNode.js").Datum} datum
     */
    handle(datum) {
        const set = this.setAccessor(datum);
        this.#assertScalar(set, "set");

        let setIndex = this.setIndexes.get(set);
        if (setIndex === undefined) {
            setIndex = this.sets.length;
            this.setIndexes.set(set, setIndex);
            this.sets.push(set);
        }

        const membership = this.membershipAccessor
            ? this.#normalizeMembership(this.membershipAccessor(datum))
            : true;
        const memberships = this.#getMemberships(datum);

        if (
            memberships.has(setIndex) &&
            memberships.get(setIndex) !== membership
        ) {
            throw new Error(
                "Conflicting membership values for the same element and set."
            );
        }

        memberships.set(setIndex, membership);
    }

    #flush() {
        const sets = this.sets;
        const elements = this.elements;
        this.#initialize();

        /**
         * @type {Map<string, {
         *   profileKey: string,
         *   profileSize: number,
         *   profileDegree: number,
         *   memberships: boolean[]
         * }>}
         */
        const profiles = new Map();

        for (const elementMemberships of elements) {
            const memberships = sets.map(
                (_, setIndex) => elementMemberships.get(setIndex) === true
            );
            const profileKey = memberships
                .map((membership) => (membership ? "1" : "0"))
                .join("");
            const existing = profiles.get(profileKey);

            if (existing) {
                existing.profileSize++;
            } else {
                profiles.set(profileKey, {
                    profileKey,
                    profileSize: 1,
                    profileDegree: memberships.filter(Boolean).length,
                    memberships,
                });
            }
        }

        for (const profile of profiles.values()) {
            for (const [setIndex, set] of sets.entries()) {
                this._propagate({
                    profileKey: profile.profileKey,
                    profileSize: profile.profileSize,
                    profileDegree: profile.profileDegree,
                    set,
                    setIndex,
                    member: profile.memberships[setIndex],
                });
            }
        }
    }

    /**
     * Flushes the preceding data before downstream nodes enter a new batch.
     *
     * @param {import("../../types/flowBatch.js").FlowBatch} flowBatch
     */
    beginBatch(flowBatch) {
        if (this.elements.length > 0) {
            this.#flush();
        }

        super.beginBatch(flowBatch);
    }

    complete() {
        if (this.elements.length > 0) {
            this.#flush();
        }

        super.complete();
    }
}
