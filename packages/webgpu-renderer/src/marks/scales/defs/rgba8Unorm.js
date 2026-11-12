import { makeFnHeader } from "../scaleEmitUtils.js";

/** @type {import("../../../index.d.ts").ScaleDef} */
const definition = {
    type: "rgba8unorm",
    input: "u32",
    output: "f32",
    params: [],
    continuous: false,
    vectorOutput: "always",
    allowsU32InputOverride: true,
    resources: {
        stopKind: null,
        needsDomainMap: false,
        needsOrdinalRange: false,
    },
    validate({ name, channel, outputComponents }) {
        return channel.data != null && outputComponents === 4
            ? null
            : `RGBA8 decoding on "${name}" requires a u32 series and four output components.`;
    },
    emit({ name, functionName, rawValueExpr }) {
        return /* wgsl */ `${makeFnHeader(name, "vec4<f32>", functionName)} {
    return unpack4x8unorm(${rawValueExpr});
}`;
    },
};

export const rgba8Unorm = Object.freeze({
    type: definition.type,
    definition: Object.freeze(definition),
});
