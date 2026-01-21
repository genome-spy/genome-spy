import { describe, expect, test } from "vitest";

import ParamMediator from "../view/paramMediator.js";
import {
    buildDomainKey,
    createAccessor,
    getAccessorDomainKey,
    isScaleAccessor,
} from "./accessor.js";

describe("Accessor domain keys", () => {
    /** @type {Array<{
     *  name: string,
     *  channel: import("../spec/channel.js").Channel,
     *  channelDef: import("../spec/channel.js").ChannelDef,
     *  resolvedType: import("../spec/channel.js").Type,
     *  expectedBase: string,
     *  expectedKey: string,
     * }>} */
    const cases = [
        {
            name: "field definitions",
            channel: "x",
            channelDef: { field: "value", type: "quantitative" },
            resolvedType: "quantitative",
            expectedBase: "x|field|value",
            expectedKey: "quantitative|x|field|value",
        },
        {
            name: "expression definitions",
            channel: "y",
            channelDef: { expr: "datum.value + 1", type: "quantitative" },
            resolvedType: "quantitative",
            expectedBase: "y|expr|datum.value + 1",
            expectedKey: "quantitative|y|expr|datum.value + 1",
        },
        {
            name: "datum values",
            channel: "x",
            channelDef: { datum: 123, type: "quantitative" },
            resolvedType: "quantitative",
            expectedBase: "x|datum|123",
            expectedKey: "quantitative|x|datum|123",
        },
    ];

    test.each(cases)(
        "$name",
        ({ channel, channelDef, resolvedType, expectedBase, expectedKey }) => {
            // ParamMediator is required even when accessors only read fields.
            const paramMediator = new ParamMediator(() => undefined);
            const accessor = createAccessor(channel, channelDef, paramMediator);

            expect(accessor.domainKeyBase).toBe(expectedBase);
            if (!isScaleAccessor(accessor)) {
                throw new Error(
                    "Expected a scale accessor for " + channel + " channel."
                );
            }
            expect(getAccessorDomainKey(accessor, resolvedType)).toBe(
                expectedKey
            );
        }
    );

    test("value literals are encoded in domain keys", () => {
        const scaleChannel =
            /** @type {import("../spec/channel.js").ChannelWithScale} */ ("x");
        const type = /** @type {import("../spec/channel.js").Type} */ (
            "nominal"
        );
        const { domainKeyBase, domainKey } = buildDomainKey({
            scaleChannel,
            source: { kind: "value", value: "blue" },
            type,
        });

        expect(domainKeyBase).toBe('x|value|"blue"');
        expect(domainKey).toBe('nominal|x|value|"blue"');
    });
});
