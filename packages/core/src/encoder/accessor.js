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
import { isExprRef, makeConstantExprRef } from "../paramRuntime/paramUtils.js";

/**
 * @param {import("../spec/channel.js").Channel} channel
 * @param {import("../spec/channel.js").ChannelDef | import("../spec/channel.js").Conditional<import("../spec/channel.js").ChannelDef>} channelDef
 * @param {{ createExpression: (expr: string) => import("../paramRuntime/types.js").ExprRefFunction }} paramRuntime
 * @returns {import("../types/encoder.js").Accessor}
 */
export function createAccessor(channel, channelDef, paramRuntime) {
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
        a.sourceKey = buildAccessorSourceKey(channelDef);

        a.scaleChannel =
            ((isChannelDefWithScale(channelDef) &&
                channelDef.resolutionChannel) ??
                (isChannelWithScale(channel) && channel)) ||
            undefined;

        if (a.scaleChannel !== undefined) {
            a.domainKeyBase = buildDomainKey({
                scaleChannel: a.scaleChannel,
                source: getDomainKeySource(channelDef),
            }).domainKeyBase;
        }

        if ("param" in channelDef) {
            // TODO: Figure out how to fix it. Interval selection depends on FIELDS!
            /*
            a.predicate = paramRuntime.createExpression(
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

        a.equals = (other) => {
            if (!other) {
                return false;
            } else {
                return (
                    a === other ||
                    (a.sourceKey !== undefined &&
                        a.sourceKey === other.sourceKey)
                );
            }
        };

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
                paramRuntime.createExpression(potentialExprRef.expr)
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
        return asAccessor(paramRuntime.createExpression(channelDef.expr));
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
 * @param {{ createExpression: (expr: string) => import("../paramRuntime/types.js").ExprRefFunction }} paramRuntime
 */
export function createConditionalAccessors(channel, channelDef, paramRuntime) {
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
                createAccessor(channel, condition, paramRuntime)
            );
        }
    }

    conditionalAccessors.push(
        createAccessor(channel, channelDef, paramRuntime)
    );

    if (conditionalAccessors.filter((a) => !a.constant).length > 1) {
        throw new Error(
            "Only one accessor can be non-constant. Channel: " + channel
        );
    }
    return conditionalAccessors;
}

/**
 * @param {import("../types/encoder.js").Accessor} accessor
 * @returns {accessor is import("../types/encoder.js").ScaleAccessor}
 */
export function isScaleAccessor(accessor) {
    return accessor.scaleChannel !== undefined;
}

/**
 * @typedef {{
 *     kind: "field",
 *     value: string,
 * } | {
 *     kind: "expr",
 *     value: string,
 * } | {
 *     kind: "datum",
 *     value: import("../spec/channel.js").Scalar | import("../spec/parameter.js").ExprRef,
 * } | {
 *     kind: "value",
 *     value: import("../spec/channel.js").Scalar | import("../spec/parameter.js").ExprRef,
 * }} DomainKeySource
 */

/**
 * @param {import("../spec/channel.js").ChannelDef} channelDef
 * @returns {DomainKeySource}
 */
function getDomainKeySource(channelDef) {
    if (isFieldDef(channelDef)) {
        return { kind: "field", value: channelDef.field };
    }

    if (isExprDef(channelDef)) {
        return { kind: "expr", value: channelDef.expr };
    }

    if (isDatumDef(channelDef)) {
        return { kind: "datum", value: channelDef.datum };
    }

    if (isValueDef(channelDef)) {
        return { kind: "value", value: channelDef.value };
    }

    throw new Error(
        "Cannot derive a domain key from channel definition: " +
            JSON.stringify(channelDef)
    );
}

/**
 * Builds a key for accessor equality. This is a structural heuristic based on
 * the data source definition and ignores channel, predicate, and scale.
 *
 * @param {import("../spec/channel.js").ChannelDef} channelDef
 * @returns {string}
 */
function buildAccessorSourceKey(channelDef) {
    const source = getDomainKeySource(channelDef);
    if (source.kind === "datum" || source.kind === "value") {
        return "constant|" + stringifyDomainValue(source.value);
    }

    return source.kind + "|" + stringifyDomainSource(source);
}

/**
 * Builds domain key strings in the format:
 * - domainKeyBase: <scaleChannel>|<kind>|<value>
 * - domainKey: <type>|<domainKeyBase>
 *
 * @param {object} options
 * @param {import("../spec/channel.js").ChannelWithScale} options.scaleChannel
 * @param {DomainKeySource} options.source
 * @param {import("../spec/channel.js").Type} [options.type]
 * @returns {{ domainKeyBase: string, domainKey?: string }}
 */
export function buildDomainKey({ scaleChannel, source, type }) {
    if (!scaleChannel) {
        throw new Error("Cannot build a domain key without a scale channel.");
    }

    const domainKeyBase =
        scaleChannel + "|" + source.kind + "|" + stringifyDomainSource(source);
    const domainKey = type ? type + "|" + domainKeyBase : undefined;

    return { domainKeyBase, domainKey };
}

/**
 * @param {import("../types/encoder.js").ScaleAccessor} accessor
 * @param {import("../spec/channel.js").Type} type
 * @returns {string}
 */
export function getAccessorDomainKey(accessor, type) {
    const { domainKey, domainKeyBase } = buildDomainKey({
        scaleChannel: accessor.scaleChannel,
        source: getDomainKeySource(accessor.channelDef),
        type,
    });
    if (!domainKey) {
        throw new Error(
            "Cannot finalize a domain key without a resolved type."
        );
    }
    accessor.domainKeyBase = domainKeyBase;
    accessor.domainKey = domainKey;
    return domainKey;
}

/**
 * @param {DomainKeySource} source
 * @returns {string}
 */
function stringifyDomainSource(source) {
    switch (source.kind) {
        case "field":
        case "expr":
            return source.value;
        case "datum":
        case "value":
            return stringifyDomainValue(source.value);
        default:
            throw new Error("Unknown domain key source.");
    }
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
