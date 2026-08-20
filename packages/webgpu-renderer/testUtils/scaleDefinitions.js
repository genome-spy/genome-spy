import { getScaleDefs } from "../src/marks/scales/scaleDefs.js";

/**
 * Attach compatibility definitions to test-owned channel fixtures.
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
function getTestScaleDefinition(type) {
    const definition = getScaleDefs()[type];
    if (!definition) {
        throw new Error(`Unknown test scale: ${type}`);
    }
    return definition;
}
