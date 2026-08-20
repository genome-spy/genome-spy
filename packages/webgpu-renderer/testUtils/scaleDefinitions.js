import { bandScaleDef } from "../src/marks/scales/defs/band.js";
import { identityScaleDef } from "../src/marks/scales/defs/identity.js";
import { indexScaleDef } from "../src/marks/scales/defs/index.js";
import { linearScaleDef } from "../src/marks/scales/defs/linear.js";
import { logScaleDef } from "../src/marks/scales/defs/log.js";
import { ordinalScaleDef } from "../src/marks/scales/defs/ordinal.js";
import { powScaleDef } from "../src/marks/scales/defs/pow.js";
import { quantizeScaleDef } from "../src/marks/scales/defs/quantize.js";
import { sqrtScaleDef } from "../src/marks/scales/defs/sqrt.js";
import { symlogScaleDef } from "../src/marks/scales/defs/symlog.js";
import { thresholdScaleDef } from "../src/marks/scales/defs/threshold.js";

/** @type {Readonly<Record<string, import("../src/index.d.ts").ScaleDef>>} */
const TEST_SCALE_DEFINITIONS = Object.freeze({
    identity: identityScaleDef,
    linear: linearScaleDef,
    log: logScaleDef,
    pow: powScaleDef,
    quantize: quantizeScaleDef,
    sqrt: sqrtScaleDef,
    symlog: symlogScaleDef,
    band: bandScaleDef,
    index: indexScaleDef,
    ordinal: ordinalScaleDef,
    threshold: thresholdScaleDef,
});

/**
 * Attach definitions to legacy-shaped, test-owned channel fixtures.
 *
 * @template {Record<string, import("../src/index.d.ts").ChannelConfigInput | import("../src/index.d.ts").ChannelConfigResolved>} T
 * @param {T} channels
 * @returns {T}
 */
export function attachScaleDefinitions(channels) {
    for (const channel of Object.values(channels)) {
        if (channel.scale && !channel.scale.definition) {
            channel.scale.definition = getTestScaleDefinition(
                channel.scale.type
            );
        }
        for (const condition of channel.conditions ?? []) {
            if (condition.channel) {
                attachScaleDefinitions({
                    condition:
                        /** @type {import("../src/index.d.ts").ChannelConfigInput} */ (
                            condition.channel
                        ),
                });
            }
        }
    }
    return channels;
}

/**
 * @param {string} type
 * @param {Omit<import("../src/index.d.ts").ChannelScale, "type" | "definition">} [options]
 * @returns {import("../src/index.d.ts").DefinedChannelScale}
 */
export function createTestScale(type, options = {}) {
    return {
        ...options,
        type,
        definition: getTestScaleDefinition(type),
    };
}

/**
 * @param {string} type
 * @returns {import("../src/index.d.ts").ScaleDef}
 */
export function getTestScaleDefinition(type) {
    const definition = TEST_SCALE_DEFINITIONS[type];
    if (!definition) {
        throw new Error(`Unknown test scale: ${type}`);
    }
    return definition;
}

/** @returns {import("../src/index.d.ts").ScaleDef[]} */
export function getTestScaleDefinitions() {
    return Object.values(TEST_SCALE_DEFINITIONS);
}
