import { buildScaleWgsl } from "../scales/scaleWgsl.js";
import HASH_TABLE_WGSL, {
    emitHashLookupFunction,
    hashLookupFunctionName,
} from "../../wgsl/hashTable.wgsl.js";
import { evaluateShaderConditionals } from "../../wgsl/conditionals.js";
import { formatLiteral } from "../../wgsl/literals.js";
import { __DEV__ } from "../../utils/dev.js";
import {
    DOMAIN_MAP_COUNT_PREFIX,
    DOMAIN_MAP_PREFIX,
    intervalSelectionActiveName,
    intervalSelectionBoundsName,
    RANGE_COUNT_PREFIX,
    RANGE_SAMPLER_PREFIX,
    RANGE_TEXTURE_PREFIX,
    SCALED_FUNCTION_PREFIX,
    SELECTION_BUFFER_PREFIX,
    SELECTION_CHECKER_PREFIX,
    SELECTION_COUNT_PREFIX,
    SELECTION_PREFIX,
} from "../../wgsl/prefixes.js";
import { buildScaledFunction } from "../scales/scaleCodegen.js";
import { buildVisibilityPredicate } from "./visibilityPredicate.js";

/**
 * @typedef {import("../../index.d.ts").ChannelConfigResolved} ChannelConfigResolved
 */

/**
 * Extra GPU resources (textures/samplers/buffers) required by a mark.
 *
 * @typedef {object} ExtraResourceDef
 * @prop {string} name
 * @prop {"texture"|"sampler"|"buffer"} kind
 * @prop {"vertex"|"fragment"|"all"} [visibility]
 * @prop {string} [wgslName]
 * @prop {"float"|"uint"|"sint"} [sampleType]
 * @prop {"2d"|"2d-array"} [dimension]
 * @prop {"filtering"|"non-filtering"} [samplerType]
 * @prop {"read-only-storage"} [bufferType]
 * @prop {string} [wgslType]
 * @prop {"extraTexture"|"extraSampler"|"extraBuffer"} role
 */

/**
 * Selection predicate wiring info emitted into WGSL.
 *
 * @typedef {object} SelectionDef
 * @prop {string} name
 * @prop {"single"|"multi"|"interval"} type
 * @prop {{ input: string, secondaryInput?: string, hitTest?: "intersects"|"encloses"|"endpoints", scalarType?: import("../../types.js").ScalarType, secondaryScalarType?: import("../../types.js").ScalarType }[]} [targets]
 */

/**
 * Inputs needed to generate WGSL and bind group layout for a mark.
 *
 * @typedef {object} ShaderBuildParams
 * @prop {import("./channelIR.js").CompiledMarkChannels} compiledChannels
 * @prop {{ name: string, type: import("../../types.js").ScalarType, components: 1|2|4, arrayLength?: number }[]} uniformLayout
 * @prop {string} shaderBody
 * @prop {Map<string, import("../programs/internal/packedSeriesLayout.js").PackedSeriesLayoutEntry>} [packedSeriesLayout]
 * @prop {SelectionDef[]} [selectionDefs]
 * @prop {import("../../index.d.ts").VisibilityPredicate} [visibleWhen]
 * @prop {Record<string, import("../../index.d.ts").ScalarSlotConfig>} [scalarSlots]
 * @prop {ExtraResourceDef[]} [extraResources]
 * @prop {import("../../index.d.ts").MarkConfig["placementIndex"]} [placementIndex]
 */

/**
 * Resource list used for debug output and validation.
 *
 * @typedef {{ name: string, role: "series"|"ordinalRange"|"domainMap"|"rangeTexture"|"rangeSampler"|"extraTexture"|"extraSampler"|"extraBuffer" }} ResourceLayoutEntry
 */

/**
 * Flags describing which per-channel resources are required.
 *
 * @typedef {object} ResourceRequirements
 * @prop {boolean} [ordinalRange]
 * @prop {boolean} [domainMap]
 * @prop {boolean} [rangeTexture]
 * @prop {boolean} [rangeSampler]
 * @prop {boolean} [rangeCountUniform]
 * @prop {boolean} [domainMapCountUniform]
 */

/**
 * Generated WGSL and corresponding binding/layout metadata.
 *
 * @typedef {{ shaderCode: string, resourceBindings: GPUBindGroupLayoutEntry[], resourceLayout: ResourceLayoutEntry[], resourceRequirements: Record<string, ResourceRequirements> }} ShaderBuildResult
 */

/**
 * Builds WGSL shader code and bind group layout entries for a mark.
 * This is pure string generation and does not touch the GPU.
 *
 * @param {ShaderBuildParams} params
 * @returns {ShaderBuildResult}
 */
export function buildMarkShader({
    compiledChannels,
    uniformLayout,
    shaderBody,
    packedSeriesLayout,
    selectionDefs = [],
    visibleWhen,
    scalarSlots = {},
    extraResources = [],
    placementIndex,
}) {
    const { channels, channelIRs, channelNames, inputNames } = compiledChannels;
    const drawPlacement =
        placementIndex &&
        "source" in placementIndex &&
        placementIndex.source === "draw";
    // Dynamic shader generation: each mark variant emits only the helpers it
    // needs. This keeps WGSL small, avoids unused bindings, and lets us
    // specialize per-mark scale logic without a single "uber" shader.

    // Storage buffers are bound after the uniform buffer (binding 0). We keep
    // their order stable so the pipeline layout matches the generated WGSL.
    /** @type {GPUBindGroupLayoutEntry[]} */
    const resourceBindings = [];
    /** @type {ResourceLayoutEntry[]} */
    const resourceLayout = [];
    /** @type {Record<string, ResourceRequirements>} */
    const resourceRequirements = {};

    // WGSL snippets are accumulated and stitched together at the end. This
    // keeps generator logic readable and makes it easy to add/remove blocks.
    /** @type {string[]} */
    const bufferDecls = [];

    /** @type {string[]} */
    const bufferReaders = [];

    /** @type {string[]} */
    const channelFns = [];

    /** @type {string[]} */
    const selectionFns = [];

    /** @type {string[]} */
    const extraDecls = [];

    /**
     * Emit a pass-through getScaled_* wrapper when no scale logic is needed.
     *
     * @param {import("./channelIR.js").ChannelIR} channelIR
     * @param {string} [functionName]
     * @returns {string}
     */
    function emitPassthroughFunction(channelIR, functionName = channelIR.name) {
        const returnType =
            channelIR.outputComponents === 1
                ? channelIR.outputScalarType
                : `vec${channelIR.outputComponents}<f32>`;
        return `fn ${SCALED_FUNCTION_PREFIX}${functionName}(i: u32) -> ${returnType} { return ${channelIR.rawValueExpr}; }`;
    }

    let bindingIndex = 1;
    const vertexComputeVisibility =
        GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE;
    const seriesChannelIRs = channelIRs.filter(
        (channelIR) => channelIR.sourceKind === "series"
    );
    const valueChannelIRs = channelIRs.filter(
        (channelIR) =>
            channelIR.sourceKind === "uniform" ||
            channelIR.sourceKind === "literal"
    );
    const ordinalRangeChannelIRs = channelIRs.filter(
        (channelIR) => channelIR.needsOrdinalRange
    );
    const domainMapChannelIRs = channelIRs.filter(
        (channelIR) => channelIR.needsDomainMap
    );
    const rangeTextureChannelIRs = channelIRs.filter(
        (channelIR) => channelIR.useRangeTexture
    );
    const uniformNames = new Set(uniformLayout.map(({ name }) => name));
    const channelIRByName = new Map(
        channelIRs.map((channelIR) => [channelIR.name, channelIR])
    );
    const selectionDefsByName = new Map(
        selectionDefs.map((def) => [def.name, def])
    );
    const visibilityPredicate = buildVisibilityPredicate({
        predicate: visibleWhen,
        channelIRs,
        channelNames,
        inputNames,
        scalarSlots,
        selectionDefs,
    });

    /**
     * @param {string} name
     * @returns {ResourceRequirements}
     */
    const ensureRequirements = (name) => {
        if (!resourceRequirements[name]) {
            resourceRequirements[name] = {};
        }
        return resourceRequirements[name];
    };

    /**
     * @param {SelectionDef} def
     * @returns {string}
     */
    function emitSelectionPredicate(def) {
        const fnName = `${SELECTION_CHECKER_PREFIX}${def.name}`;
        const uniqueId = channelIRByName.get("uniqueId");
        if (
            __DEV__ &&
            (def.type === "single" || def.type === "multi") &&
            !uniqueId
        ) {
            throw new Error(
                `Selection "${def.name}" requires a uniqueId channel.`
            );
        }
        switch (def.type) {
            case "single": {
                return /* wgsl */ `
fn ${fnName}(i: u32, allowEmpty: bool) -> bool {
    let selected = u32(params.${SELECTION_PREFIX}${def.name});
    if (allowEmpty && selected == 0u) { return true; }
    if (selected == 0u) { return false; }
    let id = ${uniqueId?.rawValueExpr ?? "0u"};
    return id == selected;
}
`;
            }
            case "multi": {
                const bufferName = SELECTION_BUFFER_PREFIX + def.name;
                const lookupName = hashLookupFunctionName(bufferName);
                return /* wgsl */ `
fn ${fnName}(i: u32, allowEmpty: bool) -> bool {
    let count = u32(params.${SELECTION_COUNT_PREFIX}${def.name});
    if (allowEmpty && count == 0u) { return true; }
    if (count == 0u) { return false; }
    let id = ${uniqueId?.rawValueExpr ?? "0u"};
    return ${lookupName}(id, arrayLength(&${bufferName})) != HASH_NOT_FOUND;
}
`;
            }
            case "interval": {
                const targets = def.targets ?? [];
                if (__DEV__ && targets.length === 0) {
                    throw new Error(
                        `Interval selection "${def.name}" must have at least one target.`
                    );
                }

                const targetChecks = targets.map((target, index) => {
                    const channelIR = channelIRByName.get(target.input);
                    const secondaryIR = target.secondaryInput
                        ? channelIRByName.get(target.secondaryInput)
                        : null;
                    if (__DEV__ && !channelIR) {
                        throw new Error(
                            `Selection "${def.name}" references missing input "${target.input}".`
                        );
                    }
                    if (__DEV__ && target.secondaryInput && !secondaryIR) {
                        throw new Error(
                            `Selection "${def.name}" references missing input "${target.secondaryInput}".`
                        );
                    }
                    if (
                        __DEV__ &&
                        target.hitTest !== undefined &&
                        target.hitTest !== "intersects" &&
                        !target.secondaryInput
                    ) {
                        throw new Error(
                            `Selection "${def.name}" cannot specify a hit-test mode without a secondary input.`
                        );
                    }

                    const activeName = intervalSelectionActiveName(
                        def.name,
                        index
                    );
                    const boundsName = intervalSelectionBoundsName(
                        def.name,
                        index
                    );
                    const valueExpr = channelIR?.rawValueExpr ?? "0.0";
                    const secondaryExpr = secondaryIR?.rawValueExpr ?? null;
                    const hitTest = target.hitTest ?? "intersects";
                    let test;
                    if (!secondaryExpr) {
                        test = `${boundsName}_lo <= ${valueExpr} && ${valueExpr} <= ${boundsName}_hi`;
                    } else if (hitTest === "encloses") {
                        test = `${boundsName}_lo <= ${boundsName}_dLo && ${boundsName}_dHi <= ${boundsName}_hi`;
                    } else if (hitTest === "endpoints") {
                        test = `(${boundsName}_lo <= ${boundsName}_d0 && ${boundsName}_d0 <= ${boundsName}_hi) || (${boundsName}_lo <= ${boundsName}_d1 && ${boundsName}_d1 <= ${boundsName}_hi)`;
                    } else if (hitTest === "intersects") {
                        test = `${boundsName}_dHi >= ${boundsName}_lo && ${boundsName}_dLo <= ${boundsName}_hi`;
                    } else {
                        throw new Error(
                            `Selection "${def.name}" has unsupported hit-test mode "${hitTest}".`
                        );
                    }

                    const secondaryDeclarations = secondaryExpr
                        ? `
        let ${boundsName}_d0 = ${valueExpr};
        let ${boundsName}_d1 = ${secondaryExpr};
        let ${boundsName}_dLo = min(${boundsName}_d0, ${boundsName}_d1);
        let ${boundsName}_dHi = max(${boundsName}_d0, ${boundsName}_d1);`
                        : "";
                    return /* wgsl */ `
    if (params.${activeName} == 0u) {
        matches = matches && allowEmpty;
    } else {
        let ${boundsName}_lo = min(params.${boundsName}.x, params.${boundsName}.y);
        let ${boundsName}_hi = max(params.${boundsName}.x, params.${boundsName}.y);${secondaryDeclarations}
        matches = matches && (${test});
    }`;
                });

                return /* wgsl */ `
fn ${fnName}(i: u32, allowEmpty: bool) -> bool {
    var matches = true;
${targetChecks.join("\n")}
    return matches;
}
`;
            }
            default: {
                throw new Error(
                    `Selection "${def.name}" has unsupported type "${def.type}".`
                );
            }
        }
    }

    /**
     * @param {import("./channelIR.js").ChannelIR} channelIR
     * @param {string} baseFunctionName
     * @returns {string}
     */
    function emitConditionalWrapper(channelIR, baseFunctionName) {
        const { name, outputComponents, outputScalarType } = channelIR;
        const returnType =
            outputComponents === 1
                ? outputScalarType
                : `vec${outputComponents}<f32>`;
        const conditions = channelIR.channel.conditions ?? [];
        const clauses = conditions.map((condition) => {
            const selectionName = condition.when.selection;
            const def = selectionDefsByName.get(selectionName);
            if (__DEV__ && !def) {
                throw new Error(
                    `Channel "${name}" references unknown selection "${selectionName}".`
                );
            }
            const allowEmpty = condition.when.empty === true ? "true" : "false";
            if (condition.channelName) {
                return `    if (${SELECTION_CHECKER_PREFIX}${selectionName}(i, ${allowEmpty})) { return ${SCALED_FUNCTION_PREFIX}${condition.channelName}(i); }`;
            }
            const literal = formatLiteral(
                outputComponents === 1 ? outputScalarType : "f32",
                outputComponents,
                condition.value
            );
            return `    if (${SELECTION_CHECKER_PREFIX}${selectionName}(i, ${allowEmpty})) { return ${literal}; }`;
        });
        return /* wgsl */ `
fn ${SCALED_FUNCTION_PREFIX}${name}(i: u32) -> ${returnType} {
${clauses.join("\n")}
    return ${SCALED_FUNCTION_PREFIX}${baseFunctionName}(i);
}
`;
    }

    // Literal formatting is centralized so constants always match the expected
    // WGSL types (e.g., float literals use ".0" when appropriate).

    const definedSymbols = new Set();
    for (const name of Object.keys(channels)) {
        definedSymbols.add(`${name}_DEFINED`);
    }
    if (placementIndex) {
        definedSymbols.add("PLACEMENT_ENABLED");
        if (drawPlacement) {
            definedSymbols.add("DRAW_PLACEMENT");
        }
    }

    // First pass: series-backed channels must map to packed series buffers and
    // emit read_* accessors plus getScaled_* wrappers.
    /** @type {Set<"f32"|"u32"|"i32">} */
    const packedTypes = new Set();
    const packedSeriesEntries = packedSeriesLayout ?? new Map();

    // Internal invariant: packed series is required when series channels exist.
    if (
        __DEV__ &&
        seriesChannelIRs.length > 0 &&
        packedSeriesEntries.size === 0
    ) {
        throw new Error(
            "Packed series layout is required for series channels."
        );
    }

    for (const entry of packedSeriesEntries.values()) {
        if (
            entry.scalarType === "f32" ||
            entry.scalarType === "u32" ||
            entry.scalarType === "i32"
        ) {
            packedTypes.add(entry.scalarType);
        } else if (__DEV__) {
            throw new Error(
                `Packed series only supports f32/u32/i32. Found "${entry.scalarType}".`
            );
        }
    }

    if (packedTypes.has("f32")) {
        const binding = bindingIndex++;
        resourceBindings.push({
            binding,
            visibility: vertexComputeVisibility,
            buffer: { type: "read-only-storage" },
        });
        resourceLayout.push({ name: "seriesF32", role: "series" });
        bufferDecls.push(
            `@group(1) @binding(${binding}) var<storage, read> seriesF32: array<f32>;`
        );
    }
    if (packedTypes.has("u32")) {
        const binding = bindingIndex++;
        resourceBindings.push({
            binding,
            visibility: vertexComputeVisibility,
            buffer: { type: "read-only-storage" },
        });
        resourceLayout.push({ name: "seriesU32", role: "series" });
        bufferDecls.push(
            `@group(1) @binding(${binding}) var<storage, read> seriesU32: array<u32>;`
        );
    }
    if (packedTypes.has("i32")) {
        const binding = bindingIndex++;
        resourceBindings.push({
            binding,
            visibility: vertexComputeVisibility,
            buffer: { type: "read-only-storage" },
        });
        resourceLayout.push({ name: "seriesI32", role: "series" });
        bufferDecls.push(
            `@group(1) @binding(${binding}) var<storage, read> seriesI32: array<i32>;`
        );
    }

    for (const channelIR of seriesChannelIRs) {
        const { name } = channelIR;
        if (channelIR.inputComponents > 1 && channelIR.scalarType !== "f32") {
            const allowPackedU32 =
                channelIR.scalarType === "u32" &&
                channelIR.inputComponents === 2 &&
                channelIR.scaleType === "index";
            if (!allowPackedU32) {
                throw new Error(
                    `Channel "${name}" does not support non-f32 vector inputs.`
                );
            }
        }

        const layoutEntry = packedSeriesEntries.get(name);
        if (__DEV__ && !layoutEntry) {
            throw new Error(
                `Packed series layout is missing entry for "${name}".`
            );
        }
        if (__DEV__ && layoutEntry.scalarType !== channelIR.scalarType) {
            throw new Error(
                `Packed series type mismatch for "${name}". Expected ${channelIR.scalarType}, got ${layoutEntry.scalarType}.`
            );
        }
        if (__DEV__ && layoutEntry.components !== channelIR.inputComponents) {
            throw new Error(
                `Packed series component mismatch for "${name}". Expected ${channelIR.inputComponents}, got ${layoutEntry.components}.`
            );
        }
        const bufferName =
            layoutEntry.scalarType === "f32"
                ? "seriesF32"
                : layoutEntry.scalarType === "u32"
                  ? "seriesU32"
                  : "seriesI32";
        const offset = layoutEntry.offset;
        const stride = layoutEntry.stride;
        if (layoutEntry.components === 1) {
            bufferReaders.push(
                `fn read_${name}(i: u32) -> ${layoutEntry.scalarType} {
    return ${bufferName}[${offset}u + i * ${stride}u];
}`
            );
        } else if (layoutEntry.components === 2) {
            bufferReaders.push(
                `fn read_${name}(i: u32) -> vec2<${layoutEntry.scalarType}> {
    let base = ${offset}u + i * ${stride}u;
    return vec2<${layoutEntry.scalarType}>(${bufferName}[base], ${bufferName}[base + 1u]);
}`
            );
        } else {
            bufferReaders.push(
                `fn read_${name}(i: u32) -> vec4<${layoutEntry.scalarType}> {
    let base = ${offset}u + i * ${stride}u;
    return vec4<${layoutEntry.scalarType}>(${bufferName}[base], ${bufferName}[base + 1u], ${bufferName}[base + 2u], ${bufferName}[base + 3u]);
}`
            );
        }

        // getScaled_* is the only function mark shaders call. It hides whether
        // values come from buffers or uniforms and applies scale logic.
        const hasConditions =
            Array.isArray(channelIR.channel.conditions) &&
            channelIR.channel.conditions.length > 0;
        const baseFunctionName = hasConditions ? `${name}_base` : name;
        if (channelIR.needsScaleFunction) {
            channelFns.push(
                buildScaledFunction({
                    name,
                    functionName: baseFunctionName,
                    scaleDef: channelIR.scaleDef,
                    rawValueExpr: channelIR.rawValueExpr,
                    scalarType: channelIR.scalarType,
                    inputComponents: channelIR.inputComponents,
                    outputComponents: channelIR.outputComponents,
                    outputScalarType: channelIR.outputScalarType,
                    scaleConfig: channelIR.channel.scale,
                    useRangeTexture: channelIR.useRangeTexture,
                    domainMapName: channelIR.needsDomainMap
                        ? `${DOMAIN_MAP_PREFIX}${name}`
                        : null,
                })
            );
        } else {
            channelFns.push(
                emitPassthroughFunction(channelIR, baseFunctionName)
            );
        }
        if (hasConditions) {
            channelFns.push(
                emitConditionalWrapper(channelIR, baseFunctionName)
            );
        }
    }

    if (selectionDefs.length > 0) {
        for (const def of selectionDefs) {
            selectionFns.push(emitSelectionPredicate(def));
        }
    }

    // Match Core's GLSL aggregate: all referenced selections, empty=false,
    // enabled only when the mark has a uniqueId channel.
    const selectionTests = channelIRByName.has("uniqueId")
        ? selectionDefs.map(
              (def) => `${SELECTION_CHECKER_PREFIX}${def.name}(i, false)`
          )
        : [];
    selectionFns.push(/* wgsl */ `
fn isDatumSelected(i: u32) -> bool {
    return ${selectionTests.join(" || ") || "false"};
}
`);

    // Ordinal scales pull range values from storage buffers. These bindings are
    // separate from series data so ranges can grow/shrink without reallocating
    // per-instance buffers.
    for (const channelIR of ordinalRangeChannelIRs) {
        const { name } = channelIR;
        const requirements = ensureRequirements(name);
        requirements.ordinalRange = true;
        requirements.rangeCountUniform = true;
        const binding = bindingIndex++;
        resourceBindings.push({
            binding,
            visibility: vertexComputeVisibility,
            buffer: { type: "read-only-storage" },
        });
        resourceLayout.push({ name, role: "ordinalRange" });

        const elementType =
            channelIR.outputComponents === 1
                ? channelIR.outputScalarType
                : "vec4<f32>";
        const rangeBufferName = `range_${name}`;

        bufferDecls.push(
            `@group(1) @binding(${binding}) var<storage, read> ${rangeBufferName}: array<${elementType}>;`
        );
    }

    // Ordinal/band scales can map sparse category IDs to dense indices via a
    // hash table stored in a read-only storage buffer.
    for (const channelIR of domainMapChannelIRs) {
        const { name } = channelIR;
        const requirements = ensureRequirements(name);
        requirements.domainMap = true;
        requirements.domainMapCountUniform = true;
        const binding = bindingIndex++;
        resourceBindings.push({
            binding,
            visibility: vertexComputeVisibility,
            buffer: { type: "read-only-storage" },
        });
        resourceLayout.push({ name, role: "domainMap" });

        const mapBufferName = `${DOMAIN_MAP_PREFIX}${name}`;
        bufferDecls.push(
            `@group(1) @binding(${binding}) var<storage, read> ${mapBufferName}: array<HashEntry>;`
        );
    }

    // Color ramps are stored as textures so interpolation matches d3 in
    // non-RGB color spaces when requested.
    for (const channelIR of rangeTextureChannelIRs) {
        const { name } = channelIR;
        const requirements = ensureRequirements(name);
        requirements.rangeTexture = true;
        requirements.rangeSampler = true;
        const textureBinding = bindingIndex++;
        resourceBindings.push({
            binding: textureBinding,
            visibility:
                GPUShaderStage.VERTEX |
                GPUShaderStage.FRAGMENT |
                GPUShaderStage.COMPUTE,
            texture: { sampleType: "float" },
        });
        resourceLayout.push({ name, role: "rangeTexture" });
        bufferDecls.push(
            `@group(1) @binding(${textureBinding}) var ${RANGE_TEXTURE_PREFIX}${name}: texture_2d<f32>;`
        );

        const samplerBinding = bindingIndex++;
        resourceBindings.push({
            binding: samplerBinding,
            visibility:
                GPUShaderStage.VERTEX |
                GPUShaderStage.FRAGMENT |
                GPUShaderStage.COMPUTE,
            sampler: { type: "filtering" },
        });
        resourceLayout.push({ name, role: "rangeSampler" });
        bufferDecls.push(
            `@group(1) @binding(${samplerBinding}) var ${RANGE_SAMPLER_PREFIX}${name}: sampler;`
        );
    }

    // Extra resources are mark-specific bindings (e.g., font atlas, glyph
    // metrics, dash patterns) that sit outside the generic channel/scale
    // pipeline and must be wired explicitly.
    for (const extra of extraResources) {
        const binding = bindingIndex++;
        const visibility =
            extra.visibility === "vertex"
                ? GPUShaderStage.VERTEX
                : extra.visibility === "fragment"
                  ? GPUShaderStage.FRAGMENT
                  : GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
        const wgslName = extra.wgslName ?? extra.name;

        if (extra.kind === "buffer") {
            resourceBindings.push({
                binding,
                visibility,
                buffer: { type: extra.bufferType ?? "read-only-storage" },
            });
            resourceLayout.push({ name: extra.name, role: extra.role });
            extraDecls.push(
                `@group(1) @binding(${binding}) var<storage, read> ${wgslName}: ${extra.wgslType ?? "array<f32>"};`
            );
            continue;
        }

        if (extra.kind === "texture") {
            const dimension = extra.dimension ?? "2d";
            const sampleType = extra.sampleType ?? "float";
            const wgslSampleType =
                sampleType === "uint"
                    ? "u32"
                    : sampleType === "sint"
                      ? "i32"
                      : "f32";
            const wgslType =
                dimension === "2d-array"
                    ? `texture_2d_array<${wgslSampleType}>`
                    : `texture_2d<${wgslSampleType}>`;

            resourceBindings.push({
                binding,
                visibility,
                texture: {
                    sampleType,
                    viewDimension: dimension === "2d-array" ? "2d-array" : "2d",
                },
            });
            resourceLayout.push({ name: extra.name, role: extra.role });
            extraDecls.push(
                `@group(1) @binding(${binding}) var ${wgslName}: ${wgslType};`
            );
            continue;
        }

        if (extra.kind === "sampler") {
            resourceBindings.push({
                binding,
                visibility,
                sampler: { type: extra.samplerType ?? "filtering" },
            });
            resourceLayout.push({ name: extra.name, role: extra.role });
            extraDecls.push(
                `@group(1) @binding(${binding}) var ${wgslName}: sampler;`
            );
        }
    }

    // Second pass: value-backed channels become either uniforms (dynamic) or
    // inline WGSL constants (static), but still expose getScaled_* wrappers.
    for (const channelIR of valueChannelIRs) {
        const { name } = channelIR;
        const hasConditions =
            Array.isArray(channelIR.channel.conditions) &&
            channelIR.channel.conditions.length > 0;
        const baseFunctionName = hasConditions ? `${name}_base` : name;
        if (channelIR.needsScaleFunction) {
            channelFns.push(
                buildScaledFunction({
                    name,
                    functionName: baseFunctionName,
                    scaleDef: channelIR.scaleDef,
                    rawValueExpr: channelIR.rawValueExpr,
                    scalarType: channelIR.scalarType,
                    inputComponents: channelIR.inputComponents,
                    outputComponents: channelIR.outputComponents,
                    outputScalarType: channelIR.outputScalarType,
                    scaleConfig: channelIR.channel.scale,
                    useRangeTexture: channelIR.useRangeTexture,
                    domainMapName: channelIR.needsDomainMap
                        ? `${DOMAIN_MAP_PREFIX}${name}`
                        : null,
                })
            );
        } else {
            channelFns.push(
                emitPassthroughFunction(channelIR, baseFunctionName)
            );
        }
        if (hasConditions) {
            channelFns.push(
                emitConditionalWrapper(channelIR, baseFunctionName)
            );
        }
    }

    // Validate that required helper uniforms (counts) are present.
    if (__DEV__) {
        for (const [name, requirements] of Object.entries(
            resourceRequirements
        )) {
            if (
                requirements.rangeCountUniform &&
                !uniformNames.has(`${RANGE_COUNT_PREFIX}${name}`)
            ) {
                throw new Error(
                    `Ordinal scale on "${name}" requires uniform "${RANGE_COUNT_PREFIX}${name}".`
                );
            }
            if (
                requirements.domainMapCountUniform &&
                !uniformNames.has(`${DOMAIN_MAP_COUNT_PREFIX}${name}`)
            ) {
                throw new Error(
                    `Scale on "${name}" requires uniform "${DOMAIN_MAP_COUNT_PREFIX}${name}".`
                );
            }
        }
    }

    // Uniform layout is provided by BaseProgram; we emit fields in the same order.
    const uniformFields = uniformLayout
        .map(({ name, type, components, arrayLength }) => {
            const scalar =
                type === "u32" ? "u32" : type === "i32" ? "i32" : "f32";
            const wgslType =
                components === 1
                    ? scalar
                    : components === 2
                      ? `vec2<${scalar}>`
                      : `vec4<${scalar}>`;
            const fieldType =
                arrayLength != null
                    ? // Uniform arrays require 16-byte aligned elements, so we
                      // store scalars in vec4 slots and read `.x` in codegen.
                      `array<vec4<${scalar}>, ${arrayLength}>`
                    : wgslType;
            return `    ${name}: ${fieldType},`;
        })
        .join("\n");

    const requiredScales = new Set(
        channelIRs
            .filter((channelIR) => channelIR.needsScaleFunction)
            .map((channelIR) => channelIR.scaleDef)
    );
    const scalesWgsl = buildScaleWgsl(requiredScales);
    const hashTableBufferNames = [
        ...domainMapChannelIRs.map(
            (channelIR) => DOMAIN_MAP_PREFIX + channelIR.name
        ),
        ...selectionDefs
            .filter((def) => def.type === "multi")
            .map((def) => SELECTION_BUFFER_PREFIX + def.name),
    ];
    const hashLookupFunctions = hashTableBufferNames
        .map(emitHashLookupFunction)
        .join("\n");
    const needsHashTable = hashTableBufferNames.length > 0;

    // Compose the final WGSL with scale helpers, per-channel accessors,
    // and the mark-specific shader body.
    // Picking reuses the mark's shading logic; shader bodies must provide
    // a `shade` function that returns the final premultiplied color.
    const pickFns = /* wgsl */ `
fn encodePickId(id: u32) -> vec4<f32> {
    let r = f32(id & 255u);
    let g = f32((id >> 8u) & 255u);
    let b = f32((id >> 16u) & 255u);
    let a = f32((id >> 24u) & 255u);
    return vec4<f32>(r, g, b, a) / 255.0;
}

@fragment
fn fs_pick(in: VSOut) -> @location(0) vec4<f32> {
#if defined(PLACEMENT_ENABLED)
    if (!isInsidePlacementClip(in.pos, in.placementClip)) { discard; }
#endif
    if (in.pickId == 0u) {
        discard;
    }
    let color = shade(in);
    if (color.a <= 0.0) {
        discard;
    }
    return encodePickId(in.pickId);
}
`;
    const shaderCode = /* wgsl */ `
struct Globals {
    width: f32,
    height: f32,
    dpr: f32,
    uZero: f32,
    logicalVisibleRect: vec4<f32>,
    cullByVisibleRange: vec4<f32>,
    viewport: vec4<f32>,
    placementIndex: u32,
    placementClipMode: u32,
    placementCount: u32,
    placementPadding: u32,
};

@group(0) @binding(0) var<uniform> globals: Globals;

#if defined(PLACEMENT_ENABLED)
@group(2) @binding(0) var<storage, read> placementRectangles: array<vec4<f32>>;

fn getPlacementIndex(i: u32) -> u32 {
#if defined(DRAW_PLACEMENT)
    return globals.placementIndex;
#else
    return u32(getScaled___placementIndex(i));
#endif
}

fn isPlacementVisible(i: u32) -> bool {
    let placementIndex = getPlacementIndex(i);
    if (placementIndex >= globals.placementCount) {
        return false;
    }
    let rect = placementRectangles[placementIndex];
    let bounds = vec4<f32>(
        globals.viewport.xy + rect.xy * globals.viewport.zw,
        globals.viewport.xy + (rect.xy + rect.zw) * globals.viewport.zw
    );
    return rect.z > 0.0 && rect.w > 0.0 &&
        bounds.x < globals.viewport.x + globals.viewport.z &&
        bounds.y < globals.viewport.y + globals.viewport.w &&
        bounds.z > globals.viewport.x && bounds.w > globals.viewport.y;
}

fn placementClipBounds(i: u32) -> vec4<f32> {
    let placementIndex = getPlacementIndex(i);
    if (placementIndex >= globals.placementCount) {
        return vec4<f32>(-1e9);
    }
    let rect = placementRectangles[placementIndex];
    return vec4<f32>(
        globals.viewport.x + rect.x * globals.viewport.z,
        globals.viewport.y + rect.y * globals.viewport.w,
        globals.viewport.x + (rect.x + rect.z) * globals.viewport.z,
        globals.viewport.y + (rect.y + rect.w) * globals.viewport.w
    );
}

fn applyPlacementPixel(pixel: vec2<f32>, i: u32) -> vec2<f32> {
    let placementIndex = getPlacementIndex(i);
    if (placementIndex >= globals.placementCount) {
        return vec2<f32>(0.0);
    }
    let rect = placementRectangles[placementIndex];
    return rect.xy * globals.viewport.zw + pixel * rect.zw;
}

fn applyTextPlacementClip(clip: vec2<f32>, i: u32) -> vec2<f32> {
    return clip;
}

fn applyPlacementClipForRule(clip: vec2<f32>, i: u32) -> vec2<f32> {
    return clip;
}

fn isInsidePlacementClip(position: vec4<f32>, placementClip: vec4<f32>) -> bool {
    let logicalPosition = position.xy / globals.dpr;
    return ((globals.placementClipMode & 1u) == 0u ||
        (logicalPosition.x >= placementClip.x && logicalPosition.x <= placementClip.z)) &&
        ((globals.placementClipMode & 2u) == 0u ||
        (logicalPosition.y >= placementClip.y && logicalPosition.y <= placementClip.w));
}

fn applyPlacementClip(clip: vec2<f32>, i: u32) -> vec2<f32> {
    let placementIndex = getPlacementIndex(i);
    if (placementIndex >= globals.placementCount) {
        return vec2<f32>(0.0);
    }
    let rect = placementRectangles[placementIndex];
    let pixel = vec2<f32>(
        (clip.x + 1.0) * globals.width * 0.5,
        (1.0 - clip.y) * globals.height * 0.5
    );
    let placed = rect.xy * globals.viewport.zw + pixel * rect.zw;
    return vec2<f32>(
        (placed.x / globals.width) * 2.0 - 1.0,
        1.0 - (placed.y / globals.height) * 2.0
    );
}

fn applyPlacementClipForPoint(clip: vec2<f32>, anchor: vec2<f32>, i: u32) -> vec2<f32> {
    let placementIndex = getPlacementIndex(i);
    if (placementIndex >= globals.placementCount) {
        return vec2<f32>(0.0);
    }
    let rect = placementRectangles[placementIndex];
    let pixel = vec2<f32>(
        (clip.x + 1.0) * globals.width * 0.5,
        (1.0 - clip.y) * globals.height * 0.5
    );
    let anchorPixel = vec2<f32>(
        (anchor.x + 1.0) * globals.width * 0.5,
        (1.0 - anchor.y) * globals.height * 0.5
    );
    let placed = rect.xy * globals.viewport.zw +
        anchorPixel * rect.zw + (pixel - anchorPixel);
    return vec2<f32>(
        (placed.x / globals.width) * 2.0 - 1.0,
        1.0 - (placed.y / globals.height) * 2.0
    );
}
#else
fn applyPlacementClipForPoint(clip: vec2<f32>, anchor: vec2<f32>, i: u32) -> vec2<f32> {
    return clip;
}

fn isPlacementVisible(i: u32) -> bool {
    return true;
}

fn applyPlacementClip(clip: vec2<f32>, i: u32) -> vec2<f32> {
    return clip;
}

fn applyPlacementPixel(pixel: vec2<f32>, i: u32) -> vec2<f32> {
    return pixel;
}

fn applyTextPlacementClip(clip: vec2<f32>, i: u32) -> vec2<f32> {
    return clip;
}

fn applyPlacementClipForRule(clip: vec2<f32>, i: u32) -> vec2<f32> {
    return clip;
}
#endif

fn isOutsideVisibleRange(pos: vec2<f32>) -> bool {
    return (globals.cullByVisibleRange.x > 0.5 &&
                (pos.x < globals.logicalVisibleRect.x ||
                 pos.x > globals.logicalVisibleRect.z)) ||
           (globals.cullByVisibleRange.y > 0.5 &&
                (pos.y < globals.logicalVisibleRect.y ||
                 pos.y > globals.logicalVisibleRect.w));
}

${scalesWgsl}
${needsHashTable ? HASH_TABLE_WGSL : ""}

struct Params {
${uniformFields}
};

@group(1) @binding(0) var<uniform> params: Params;

${bufferDecls.join("\n")}

${bufferReaders.join("\n")}

${selectionFns.join("\n")}

${channelFns.join("\n")}

${extraDecls.join("\n")}

${hashLookupFunctions}

${visibilityPredicate}

fn premultiplyAlpha(color: vec4<f32>) -> vec4<f32> {
    return vec4<f32>(color.rgb * color.a, color.a);
}

${shaderBody}
${pickFns}
`;

    return {
        shaderCode: evaluateShaderConditionals(shaderCode, definedSymbols),
        resourceBindings,
        resourceLayout,
        resourceRequirements,
    };
}
