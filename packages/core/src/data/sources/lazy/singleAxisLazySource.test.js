import { describe, expect, test, vi } from "vitest";

import { loadViewSubtreeData } from "../../flowInit.js";
import SingleAxisLazySource from "./singleAxisLazySource.js";

class TestLazySource extends SingleAxisLazySource {
    /** @type {{ domain: number[], complexDomain: any[] }[]} */
    calls = [];

    /**
     * @param {ReturnType<typeof createViewStub>["view"]} view
     */
    constructor(view) {
        super(/** @type {any} */ (view), "x");
    }

    /**
     * @param {number[]} domain
     * @param {any[]} complexDomain
     */
    onDomainChanged(domain, complexDomain) {
        this.calls.push({ domain, complexDomain });
    }
}

function createViewStub() {
    /** @type {Map<string, () => void>} */
    const scaleListeners = new Map();
    /** @type {Map<string, () => void>} */
    const broadcastListeners = new Map();
    const domain = [0, 10];
    const complexDomain = [
        { chrom: "chr1", pos: 0 },
        { chrom: "chr1", pos: 10 },
    ];
    const scaleResolution = {
        addEventListener: vi.fn((type, listener) => {
            scaleListeners.set(type, listener);
        }),
        removeEventListener: vi.fn(),
        getDomain: () => domain,
        getComplexDomain: () => complexDomain,
    };

    const view = {
        context: {
            addBroadcastListener: vi.fn((type, listener) => {
                broadcastListeners.set(type, listener);
            }),
            removeBroadcastListener: vi.fn(),
            dataFlow: {
                loadingStatusRegistry: {
                    set: vi.fn(),
                },
            },
        },
        getScaleResolution: () => scaleResolution,
        isVisible: () => true,
    };

    return { view, scaleListeners, broadcastListeners, domain, complexDomain };
}

describe("SingleAxisLazySource", () => {
    test("ignores domain events until initial load activates the source", async () => {
        const { view, scaleListeners, broadcastListeners, domain } =
            createViewStub();
        const source = new TestLazySource(view);

        // Layout can be computed while view initialization is still waiting for
        // fonts. Lazy loading must not start before loadViewSubtreeData starts
        // the source-loading lifecycle.
        broadcastListeners.get("layoutComputed")?.();
        scaleListeners.get("domain")?.();
        expect(source.calls).toEqual([]);

        await loadViewSubtreeData(
            /** @type {any} */ ({
                /**
                 * @returns {void}
                 */
                visit: () => undefined,
            }),
            new Set([source])
        );
        expect(source.calls).toEqual([]);

        broadcastListeners.get("layoutComputed")?.();
        expect(source.calls.map((call) => call.domain)).toEqual([domain]);
    });
});
