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
        a.domainKeyBase = getDomainKeyBase(channelDef);

        a.scaleChannel =
            ((isChannelDefWithScale(channelDef) &&
                channelDef.resolutionChannel) ??
                (isChannelWithScale(channel) && channel)) ||
            undefined;

        if ("param" in channelDef) {
            // TODO: Figure out how to fix it. Interval selection depends on FIELDS!
            /*
            a.predicate = paramMediator.createExpression(
                makeSelectionTestExpression(channelDef)
            );
            a.predicate.param = channelDef.param;
            a.predicate.empty = channelDef.empty ?? true;
            */
            a.predicate = makeConstantExprRef(false);
            a.predicate.param = channelDef.param;
            a.predicate.empty = channelDef.empty ?? true;
        } else {
            a.predicate = makeConstantExprRef(true); // Always true (default accessor)
            a.predicate.empty = false;
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
            `Invalid channel definition: "${channel}": ${JSON.stringify(
                channelDef
            )}! The channel definition must contain one of the following properties: "field", "datum", "value" or "expr".`
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
        const conditions = Array.isArray(channelDef.condition)
            ? channelDef.condition
            : [channelDef.condition];

        for (const condition of conditions) {
            conditionalAccessors.push(
                createAccessor(channel, condition, paramMediator)
            );
        }
    }

    conditionalAccessors.push(
        createAccessor(channel, channelDef, paramMediator)
    );

    if (conditionalAccessors.filter((a) => !a.constant).length > 1) {
        throw new Error(
            "Only one accessor can be non-constant. Channel: " + channel
        );
    }
    return conditionalAccessors;
}

/**
 * @param {import("../spec/channel.js").ChannelDef} channelDef
 * @returns {string}
 */
export function getDomainKeyBase(channelDef) {
    if (isFieldDef(channelDef)) {
        return "field|" + channelDef.field;
    }

    if (isExprDef(channelDef)) {
        return "expr|" + channelDef.expr;
    }

    if (isDatumDef(channelDef)) {
        return "datum|" + stringifyDomainValue(channelDef.datum);
    }

    if (isValueDef(channelDef)) {
        return "value|" + stringifyDomainValue(channelDef.value);
    }

    throw new Error(
        "Cannot derive a domain key from channel definition: " +
            JSON.stringify(channelDef)
    );
}

/**
 * @param {string} domainKeyBase
 * @param {import("../spec/channel.js").Type} type
 * @returns {string}
 */
export function finalizeDomainKey(domainKeyBase, type) {
    if (!type) {
        throw new Error(
            "Cannot finalize a domain key without a resolved type."
        );
    }
    return type + "|" + domainKeyBase;
}

/**
 * @param {import("../types/encoder.js").Accessor} accessor
 * @param {import("../spec/channel.js").Type} type
 * @returns {string}
 */
export function getAccessorDomainKey(accessor, type) {
    const domainKeyBase =
        accessor.domainKeyBase ?? getDomainKeyBase(accessor.channelDef);
    accessor.domainKeyBase = domainKeyBase;
    const domainKey = finalizeDomainKey(domainKeyBase, type);
    accessor.domainKey = domainKey;
    return domainKey;
}

/**
 * @param {import("../spec/channel.js").Scalar | import("../spec/parameter.js").ExprRef} value
 * @returns {string}
 */
function stringifyDomainValue(value) {
    if (isExprRef(value)) {
        return "expr:" + value.expr;
    }

    if (value === undefined) {
        return "undefined";
    }

    return JSON.stringify(value);
}
