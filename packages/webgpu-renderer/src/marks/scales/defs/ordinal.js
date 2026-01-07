import {
    DOMAIN_MAP_COUNT_PREFIX,
    RANGE_COUNT_PREFIX,
} from "../../../wgsl/prefixes.js";
import { isValueChannelConfig } from "../../../types.js";
import { makeFnHeader, toU32Expr } from "../scaleEmitUtils.js";
import { normalizeOrdinalDomain } from "../ordinalDomain.js";

/**
 * Ordinal scale: maps categorical ids to discrete range entries.
 *
 * Technical notes: optionally uses a hash map to remap sparse domains to
 * contiguous indices before indexing the ordinal range buffer.
 *
 * @type {import("../../../index.d.ts").ScaleDef}
 */
export const ordinalScaleDef = {
    input: "u32",
    output: "same",
    params: [],
    continuous: false,
    vectorOutput: "always",
    allowsU32InputOverride: true,
    resources: {
        stopKind: null,
        needsDomainMap: true,
        needsOrdinalRange: true,
    },
    normalizeDomainMap: normalizeOrdinalDomainMap,
    validate: validateOrdinalScale,
    emit: emitOrdinalScale,
};

/**
 * @param {import("../../../index.d.ts").ScaleEmitParams} params
 * @returns {string}
 */
function emitOrdinalScale({
    name,
    functionName,
    rawValueExpr,
    inputScalarType,
    outputComponents,
    outputScalarType,
    domainMapName,
}) {
    const returnType =
        outputComponents === 1
            ? outputScalarType
            : `vec${outputComponents}<f32>`;
    const rangeName = `range_${name}`;
    const zero =
        outputComponents === 1
            ? outputScalarType === "u32"
                ? "0u"
                : outputScalarType === "i32"
                  ? "0"
                  : "0.0"
            : "vec4<f32>(0.0)";
    const valueExpr = toU32Expr(rawValueExpr, inputScalarType);

    const mapCountName = DOMAIN_MAP_COUNT_PREFIX + name;
    if (domainMapName) {
        return `${makeFnHeader(name, returnType, functionName)} {
    let raw = ${valueExpr};
    let mapCount = u32(params.${mapCountName});
    if (mapCount == 0u) {
        let count = u32(params.${RANGE_COUNT_PREFIX}${name});
        if (count == 0u) { return ${zero}; }
        let slot = min(raw, count - 1u);
        return ${rangeName}[slot];
    }
    let idx = hashLookup(&${domainMapName}, raw, arrayLength(&${domainMapName}));
    if (idx == HASH_NOT_FOUND) { return ${zero}; }
    let count = u32(params.${RANGE_COUNT_PREFIX}${name});
    if (count == 0u) { return ${zero}; }
    let slot = min(idx, count - 1u);
    return ${rangeName}[slot];
}`;
    }

    return `${makeFnHeader(name, returnType, functionName)} {
    let idx = ${valueExpr};
    let count = u32(params.${RANGE_COUNT_PREFIX}${name});
    if (count == 0u) { return ${zero}; }
    let slot = min(idx, count - 1u);
    return ${rangeName}[slot];
}`;
}

/**
 * @param {import("../../../index.d.ts").ScaleValidationContext} context
 * @returns {string | null}
 */
function validateOrdinalScale({
    name,
    channel,
    outputComponents,
    inputComponents,
}) {
    if (outputComponents !== 1 && outputComponents !== 4) {
        return `Channel "${name}" uses ${outputComponents} components but ordinal scales only support scalars or vec4 outputs.`;
    }
    const range = channel.scale?.range;
    if (!Array.isArray(range) || range.length === 0) {
        return `Ordinal scale on "${name}" requires a non-empty range.`;
    }
    if (inputComponents !== 1) {
        return `Ordinal scale on "${name}" requires scalar input values.`;
    }
    if (isValueChannelConfig(channel)) {
        if (Array.isArray(channel.value)) {
            return `Ordinal scale on "${name}" requires scalar integer values.`;
        }
        if (
            typeof channel.value === "number" &&
            !Number.isInteger(channel.value)
        ) {
            return `Ordinal scale on "${name}" requires integer values.`;
        }
    }
    return null;
}

/**
 * @param {import("../../../index.d.ts").ScaleDomainMapParams} params
 * @returns {import("../../../index.d.ts").ScaleDomainMapUpdate | null}
 */
function normalizeOrdinalDomainMap({ name, domain }) {
    const ordinalDomain = normalizeOrdinalDomain(name, "ordinal", domain);
    if (!ordinalDomain) {
        return null;
    }
    return { domainMap: ordinalDomain };
}
