import { createRendererWithFeatures, RendererError } from "./renderer.js";
import RectProgram from "./marks/programs/rectProgram.js";
import PointProgram from "./marks/programs/pointProgram.js";
import RuleProgram from "./marks/programs/ruleProgram.js";
import LinkProgram from "./marks/programs/linkProgram.js";
import TextProgram from "./marks/programs/textProgram.js";
import { getScaleDefs, registerScaleDef } from "./marks/scales/scaleDefs.js";
export { setDebugResourcesEnabled } from "./marks/programs/internal/baseProgram.js";
export { RendererError, registerScaleDef };

/** @type {Map<string, import("./index.d.ts").MarkDefinition<any>>} */
const LEGACY_MARK_DEFINITIONS = new Map([
    ["rect", createLegacyMarkDefinition("rect", RectProgram)],
    ["point", createLegacyMarkDefinition("point", PointProgram)],
    ["rule", createLegacyMarkDefinition("rule", RuleProgram)],
    ["link", createLegacyMarkDefinition("link", LinkProgram)],
    ["text", createLegacyMarkDefinition("text", TextProgram)],
]);

/**
 * Create a renderer with the temporary built-in string dispatch used by the
 * existing examples and the Core proof of concept.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {import("./index.d.ts").RendererOptions} [options]
 * @returns {Promise<import("./renderer.js").Renderer>}
 */
export function createRenderer(canvas, options = {}) {
    return createRendererWithFeatures(canvas, options, {
        legacyMarkDefinitions: LEGACY_MARK_DEFINITIONS,
    });
}

/**
 * @param {import("./index.d.ts").MarkType} type
 * @param {new (...args: any[]) => import("./index.d.ts").MarkProgram} Program
 * @returns {import("./index.d.ts").MarkDefinition<any>}
 */
function createLegacyMarkDefinition(type, Program) {
    return Object.freeze({
        type,
        createProgram(renderer, config) {
            return new Program(
                /** @type {any} */ (renderer),
                resolveLegacyMarkConfig(config)
            );
        },
    });
}

/**
 * Attach imported definitions to legacy string-based scale configs without
 * mutating caller-owned objects.
 *
 * @param {import("./index.d.ts").MarkConfig} config
 * @returns {import("./index.d.ts").MarkConfig}
 */
function resolveLegacyMarkConfig(config) {
    return /** @type {import("./index.d.ts").MarkConfig} */ ({
        ...config,
        channels: Object.fromEntries(
            Object.entries(config.channels).map(([name, channel]) => {
                if (typeof channel == "object" && channel) {
                    return [
                        name,
                        resolveLegacyChannel(
                            /** @type {import("./index.d.ts").ChannelConfigInput} */ (
                                channel
                            )
                        ),
                    ];
                }
                return [name, channel];
            })
        ),
    });
}

/**
 * @param {import("./index.d.ts").ChannelConfigInput} channel
 * @returns {import("./index.d.ts").ChannelConfigInput}
 */
function resolveLegacyChannel(channel) {
    let resolved = channel;
    if (channel.scale && !channel.scale.definition) {
        const definition = getScaleDefs()[channel.scale.type];
        if (!definition) {
            throw new RendererError(
                `Unknown scale type: ${channel.scale.type}`
            );
        }
        resolved = {
            ...resolved,
            scale: { ...channel.scale, definition },
        };
    }

    if (channel.conditions?.length) {
        resolved = /** @type {import("./index.d.ts").ChannelConfigInput} */ ({
            ...resolved,
            conditions: channel.conditions.map((condition) =>
                condition.channel
                    ? {
                          ...condition,
                          channel: resolveLegacyChannel(
                              /** @type {import("./index.d.ts").ChannelConfigInput} */ (
                                  condition.channel
                              )
                          ),
                      }
                    : condition
            ),
        });
    }
    return resolved;
}
