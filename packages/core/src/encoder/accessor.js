import { constant } from "vega-util";
import {
    isChannelDefWithScale,
    isChannelWithScale,
    isDatumDef,
    isExprDef,
    isFieldDef,
    isFieldOrDatumDefWithCondition,
    isValueDef,
    isValueDefWithCondition,
} from "./encoder.js";
import { field } from "../utils/field.js";
import { isExprRef, makeConstantExprRef } from "../view/paramMediator.js";
import { makeSelectionTestExpression } from "../selection/selection.js";

/**
 * @param {import("../spec/channel.js").Channel} channel
 * @param {import("../spec/channel.js").ChannelDef} channelDef
 * @param {import("../view/paramMediator.js").default} paramMediator
 * @returns {import("../types/encoder.js").Accessor}
 */
export function createAccessor(channel, channelDef, paramMediator) {
    if (!channel) {
        // TODO: Don't call with an undefined channel
        return;
    }

    function asAccessor(/** @type {Function} */ fn) {
        const a = /** @type {import("../types/encoder.js").Accessor} */ (fn);
        a.constant = false;
        a.fields ??= [];
        a.channelDef = channelDef;
        a.channel = channel;

        a.scaleChannel =
            ((isChannelDefWithScale(channelDef) &&
                channelDef.resolutionChannel) ??
                (isChannelWithScale(channel) && channel)) ||
            undefined;

        a.asNumberAccessor = () =>
            /** @type {import("../types/encoder.js").Accessor<number>} */ (a);

        return a;
    }

    if (isFieldDef(channelDef)) {
        try {
            const a = asAccessor(field(channelDef.field));
            return a;
        } catch (e) {
            throw new Error(`Invalid field definition: ${e.message}`);
        }
    } else if (isExprDef(channelDef)) {
        // TODO: If parameters change, the data should be re-evaluated
        const a = asAccessor(paramMediator.createExpression(channelDef.expr));
        return a;
    } else if (isDatumDef(channelDef)) {
        const a = asAccessor(constant(channelDef.datum));
        a.constant = true; // Can be optimized downstream
        return a;
    } else if (isValueDef(channelDef)) {
        if (isExprRef(channelDef.value)) {
            const a = asAccessor(
                paramMediator.createExpression(channelDef.value.expr)
            );
            if (a.fields.length > 0) {
                throw new Error(
                    "Expression in ValueDef cannot access datum fields: " +
                        channelDef.value.expr
                );
            }
            a.constant = true;
            return a;
        } else {
            const value = channelDef.value;
            const a = asAccessor(() => value);
            a.constant = true;
            return a;
        }
    } else {
        throw new Error(
            `Invalid channel definition: ${JSON.stringify(
                channelDef
            )}. Cannot create an accessor for channel ${channel}!`
        );
    }
}

/**
 * Returns an array of acessors and their predicates. A returned array with
 * a single element indicates that no conditions are present.
 * The default accessor is always the last element in the array.
 *
 * @param {import("../spec/channel.js").Channel} channel
 * @param {import("../spec/channel.js").ChannelDef} channelDef
 * @param {import("../view/paramMediator.js").default} paramMediator
 */
export function createConditionalAccessors(channel, channelDef, paramMediator) {
    /** @type {import("../types/encoder.js").PredicateAndAccessor[]} */
    const conditionalAccessors = [];

    if (
        isFieldOrDatumDefWithCondition(channelDef) ||
        isValueDefWithCondition(channelDef)
    ) {
        const condition = channelDef.condition;

        const accessor = createAccessor(channel, condition, paramMediator);

        conditionalAccessors.push({
            predicate: paramMediator.createExpression(
                makeSelectionTestExpression(condition)
            ),
            param: condition.param,
            accessor,
        });
    }

    conditionalAccessors.push({
        predicate: makeConstantExprRef(true), // Always true (default accessor)
        param: null,
        accessor: createAccessor(channel, channelDef, paramMediator),
    });

    return conditionalAccessors;
}
