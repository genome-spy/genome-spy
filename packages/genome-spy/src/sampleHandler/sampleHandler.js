import produce from "immer";

import * as Actions from "./sampleHandlerActions";
import { peek } from "../utils/arrayUtils";
import {
    sort,
    retainFirstOfEach,
    filterQuantitative,
    filterNominal,
    filterUndefined,
    wrapAccessorForComparison
} from "./sampleOperations";
import Provenance from "./provenance";
import {
    groupSamplesByAccessor,
    groupSamplesByQuartiles
} from "./groupOperations";

/**
 * This class handles sample sorting, filtering, grouping, etc.
 *
 * @typedef {import("./sampleState").State} State
 * @typedef {import("./sampleState").Group} Group
 * @typedef {import("./sampleState").SampleGroup} SampleGroup
 * @typedef {import("./sampleState").GroupGroup} GroupGroup
 *
 * @typedef {object} AttributeIdentifier An identifier for an abstract attribute.
 *      Allows for retrieving an accessor and information.
 * @prop {string} type
 * @prop {any} [specifier]
 *
 * @typedef {object} AttributeInfo
 * @prop {string} name
 * @prop {function(string):any} accessor A function that maps a sampleId to an attribute value
 * @prop {string} type e.g., "quantitative"
 * @prop {any} scale
 *
 * @typedef {(function(AttributeIdentifier):AttributeInfo)} AttributeInfoSource
 *
 */
export default class SampleHandler {
    constructor() {
        /**
         *
         * @type {Record<string, AttributeInfoSource>}
         */
        this.attributeInfoSourcesByType = {};

        /** @type {Provenance<State>} */
        this.provenance = new Provenance();
    }

    get state() {
        return this.provenance.state;
    }

    /**
     *
     * @param {string} type
     * @param {AttributeInfoSource} attributeInfoSource
     */
    addAttributeInfoSource(type, attributeInfoSource) {
        this.attributeInfoSourcesByType[type] = attributeInfoSource;
    }

    /**
     *
     * @param {AttributeIdentifier} attribute
     */
    getAttributeInfo(attribute) {
        const source = this.attributeInfoSourcesByType[attribute.type];
        if (!source) {
            throw new Error(
                "Cannot find attribute info source for: " +
                    JSON.stringify(attribute)
            );
        }

        const info = source(attribute);
        if (info) {
            return info;
        }

        throw new Error("Unknown attribute: " + JSON.stringify(attribute));
    }

    /**
     * Sets the samples that we are working with, resets the state.
     *
     * @param {string[]} samples
     */
    setSamples(samples) {
        // TODO: Apply through an action
        this.provenance.setInitialState({
            groups: [],
            rootGroup: {
                name: "ROOT",
                samples
            }
        });
    }

    /**
     * Returns a flattened group hierarchy. The result is an array of
     * flat hierarchies, i.e. each element is an array of groups and the
     * last group of each array is a SampleGroup which contains the samples.
     *
     * @param {State} [state] State to use, defaults to the current state.
     *      Use for mutations!
     */
    getFlattenedGroupHierarchy(state) {
        if (!state) {
            state = this.state;
        }

        /** @type {Group[]} */
        const pathStack = [];

        /** @type {Group[][]} */
        const flattenedHierarchy = [];

        /** @param {Group} group */
        const recurse = group => {
            pathStack.push(group);
            if (isGroupGroup(group)) {
                // WTF type guard not workin!
                for (const child of group.groups) {
                    recurse(child);
                }
            } else {
                flattenedHierarchy.push([...pathStack]);
            }

            pathStack.pop();
        };

        recurse(state.rootGroup);

        return flattenedHierarchy;
    }

    /**
     *
     * @param {any} action
     */
    dispatch(action) {
        /** Returns an accessor to an abstract attribute. TODO: Memoize */
        const getAccessor = () =>
            this.getAttributeInfo(action.attribute).accessor;

        /**
         *
         * @param {State} [state] State to use, defaults to the current state.
         *      Use for mutations!
         */
        const getSampleGroups = state =>
            /** @type {SampleGroup[]} */ (this.getFlattenedGroupHierarchy(
                state
            ).map(path => peek(path)));

        /**
         * Applies an operation to each group of samples.
         * @param {function(string[]):string[]} operation What to do for each group.
         *      Takes an array of sample ids and returns a new filtered and/or permuted array.
         */
        const applyToSamples = operation => {
            const newState = produce(this.state, draftState => {
                for (const sampleGroup of getSampleGroups(draftState)) {
                    sampleGroup.samples = operation(sampleGroup.samples);
                }
            });
            this.provenance.push(newState, action);
        };

        /**
         * Applies an operation to all SampleGroups.
         * @param {function(SampleGroup):void} operation What to do for each group.
         *      Operations modify the groups in place
         */
        const applyToGroups = operation => {
            const newState = produce(this.state, draftState => {
                for (const sampleGroup of getSampleGroups(draftState)) {
                    operation(sampleGroup);
                }
                draftState.groups.push({ name: action.attribute });
            });
            this.provenance.push(newState, action);
        };

        switch (action.type) {
            case Actions.UNDO:
                this.provenance.undo();
                return;
            case Actions.SORT_BY:
                applyToSamples(samples =>
                    sort(
                        samples,
                        wrapAccessorForComparison(
                            getAccessor(),
                            this.getAttributeInfo(action.attribute)
                        ),
                        false
                    )
                );
                break;
            case Actions.RETAIN_FIRST_OF_EACH:
                applyToSamples(samples =>
                    retainFirstOfEach(samples, getAccessor())
                );
                break;
            case Actions.FILTER_BY_QUANTITATIVE:
                applyToSamples(samples =>
                    filterQuantitative(
                        samples,
                        getAccessor(),
                        action.operator,
                        action.operand
                    )
                );
                break;
            case Actions.FILTER_BY_NOMINAL:
                applyToSamples(samples =>
                    filterNominal(
                        samples,
                        getAccessor(),
                        action.action,
                        action.values
                    )
                );
                break;
            case Actions.REMOVE_UNDEFINED:
                applyToSamples(samples =>
                    filterUndefined(samples, getAccessor())
                );
                break;
            case Actions.GROUP_BY_NOMINAL:
                applyToGroups(sampleGroup =>
                    groupSamplesByAccessor(sampleGroup, getAccessor())
                );
                break;
            case Actions.GROUP_TO_QUARTILES:
                applyToGroups(sampleGroup =>
                    groupSamplesByQuartiles(sampleGroup, getAccessor())
                );
                break;
            default:
                throw new Error("Unknown action: " + JSON.stringify(action));
        }
    }
}

/**
 * @param {Group} group
 * @return {Group is SampleGroup}
 */
export function isSampleGroup(group) {
    return "samples" in group;
}

/**
 * @param {Group} group
 * @return {Group is GroupGroup}
 */
export function isGroupGroup(group) {
    return "groups" in group;
}
