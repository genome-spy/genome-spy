import { describe, expect, test } from "vitest";
import {
    collectScaleDomains,
    shouldSerializeScaleDomain,
} from "./scaleDomainUtils.js";

describe("scaleDomainUtils", () => {
    test("skips separate scale-domain serialization when a linked selection is persisted", () => {
        const resolution = {
            getResolvedScaleType: () => "linear",
            getLinkedSelectionDomainInfo: () => ({
                param: "brush",
                encoding: "x",
                persist: true,
            }),
        };

        expect(shouldSerializeScaleDomain(resolution)).toBe(false);
    });

    test("serializes scale domains when the linked selection is ephemeral", () => {
        const resolution = {
            getResolvedScaleType: () => "linear",
            getLinkedSelectionDomainInfo: () => ({
                param: "brush",
                encoding: "x",
                persist: false,
            }),
        };

        expect(shouldSerializeScaleDomain(resolution)).toBe(true);
    });

    test("collects only separately persisted scale domains", () => {
        const genomeSpy = {
            getNamedScaleResolutions: () =>
                new Map([
                    [
                        "linked",
                        {
                            getResolvedScaleType: () => "index",
                            isZoomed: () => true,
                            getComplexDomain: () => [1, 2],
                            getLinkedSelectionDomainInfo: () => ({
                                param: "brush",
                                encoding: "x",
                                persist: true,
                            }),
                        },
                    ],
                    [
                        "ephemeralLinked",
                        {
                            getResolvedScaleType: () => "index",
                            isZoomed: () => true,
                            getComplexDomain: () => [3, 4],
                            getLinkedSelectionDomainInfo: () => ({
                                param: "brush",
                                encoding: "x",
                                persist: false,
                            }),
                        },
                    ],
                    ...["band", "point"].map((type) => [
                        type,
                        {
                            getResolvedScaleType: () => type,
                            isZoomed: () => true,
                            getComplexDomain: () => [0, 1],
                        },
                    ]),
                    [
                        "plain",
                        {
                            getResolvedScaleType: () => "index",
                            isZoomed: () => true,
                            getComplexDomain: () => [5, 6],
                            getLinkedSelectionDomainInfo: () => undefined,
                        },
                    ],
                ]),
        };

        expect(
            collectScaleDomains(genomeSpy, (scaleResolution) =>
                scaleResolution.isZoomed()
            )
        ).toEqual({
            ephemeralLinked: [3, 4],
            plain: [5, 6],
        });
    });
});
