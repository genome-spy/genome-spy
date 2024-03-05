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
 * @param {import("../spec/channel.js").ChannelDef | import("../spec/channel.js").Conditional<import("../spec/channel.js").ChannelDef>} channelDef
 * @param {import("../view/paramMediator.js").default} paramMediator
 * @returns {import("../types/encoder.js").Accessor}
 */
export function createAccessor(channel, channelDef, paramMediator) {
    /**
     * @typedef {import("../data/flowNode.js").Datum} Datum
     * @typedef {import("../spec/channel.js").Scalar} Scalar
     */

    if (!channel) {
        // TODO: Don't call with an undefined channel
        return;
    }

    /**
     * @param {(datum?: Datum) => Scalar} fn
     * @returns {import("../types/encoder.js").Accessor<Scalar>}
     */
    function asAccessor(fn) {
        const a = /** @type {import("../types/encoder.js").Accessor} */ (fn);
        a.fields ??= [];
        a.constant = a.fields.length === 0;
        a.channelDef = channelDef;
        a.channel = channel;

        a.scaleChannel =
            ((isChannelDefWithScale(channelDef) &&
                channelDef.resolutionChannel) ??
                (isChannelWithScale(channel) && channel)) ||
            undefined;

        if ("param" in channelDef) {
            a.predicate = paramMediator.createExpression(
                makeSelectionTestExpression(channelDef)
            );
            a.predicate.param = channelDef.param;
        } else {
            a.predicate = makeConstantExprRef(true); // Always true (default accessor)
        }

        a.asNumberAccessor = () =>
            /** @type {import("../types/encoder.js").Accessor<number>} */ (a);

        return a;
    }

    /**
     *
     * @param {Scalar | import("../spec/parameter.js").ExprRef} potentialExprRef
     */
    function potentialExprRefToAccessor(potentialExprRef) {
        if (isExprRef(potentialExprRef)) {
            const a = asAccessor(
                paramMediator.createExpression(potentialExprRef.expr)
            );
            if (a.fields.length > 0) {
                throw new Error(
                    "Expression in DatumDef/ValueDef cannot access data fields: " +
                        potentialExprRef.expr
                );
            }
            return a;
        } else {
            const v = potentialExprRef;
            return asAccessor(() => v);
        }
    }

    if (isFieldDef(channelDef)) {
        try {
            return asAccessor(field(channelDef.field));
        } catch (e) {
            throw new Error(`Invalid field definition: ${e.message}`);
        }
    } else if (isExprDef(channelDef)) {
        // TODO: If parameters change, the data should be re-evaluated
        return asAccessor(paramMediator.createExpression(channelDef.expr));
    } else if (isDatumDef(channelDef)) {
        return potentialExprRefToAccessor(channelDef.datum);
    } else if (isValueDef(channelDef)) {
        return potentialExprRefToAccessor(channelDef.value);
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
    /** @type {import("../types/encoder.js").Accessor[]} */
    const conditionalAccessors = [];

    // TODO: Support an array of conditions
    if (
        isFieldOrDatumDefWithCondition(channelDef) ||
        isValueDefWithCondition(channelDef)
    ) {
        conditionalAccessors.push(
            createAccessor(channel, channelDef.condition, paramMediator)
        );
    }

    conditionalAccessors.push(
        createAccessor(channel, channelDef, paramMediator)
    );

    return conditionalAccessors;
}
