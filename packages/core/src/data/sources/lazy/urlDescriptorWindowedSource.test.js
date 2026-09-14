import { afterEach, describe, expect, it, vi } from "vitest";
import UrlDescriptorWindowedSource from "./urlDescriptorWindowedSource.js";

/** @extends {UrlDescriptorWindowedSource<object, import("../../flowNode.js").Datum[][]>} */
class TestSource extends UrlDescriptorWindowedSource {
    /**
     * @param {"domain" | "window"} debounceMode
     * @param {{ modules: () => Promise<undefined>, handles: () => Promise<object>, loads: (interval: number[]) => void }} calls
     * @param {ReturnType<typeof createViewStub>} view
     */
    constructor(debounceMode, calls, view) {
        super(/** @type {any} */ (view), "x");
        this.params = { windowSize: 20 };
        this.setupDebouncing({ debounce: 0, debounceMode });
        this.setupUrlDescriptors(
            { getUrl: () => "data" },
            {
                loadModules: calls.modules,
                createHandle: calls.handles,
            }
        );
        this.calls = calls;
    }

    /**
     * @param {number[]} interval
     * @returns {Promise<{interval: number[], data: import("../../flowNode.js").Datum[][]}>}
     */
    async loadIntervalData(interval) {
        this.calls.loads(interval);
        return { interval, data: [/** @type {any[]} */ ([])] };
    }
}

function createCalls() {
    return {
        modules: vi.fn(async () => undefined),
        handles: vi.fn(async () => ({})),
        loads: vi.fn(),
    };
}

function createViewStub() {
    /** @type {import("../../../types/viewContext.js").DataLoadingStatus[]} */
    const loadingStatuses = [];
    const genome = {
        totalSize: 100,
        continuousToDiscreteChromosomeIntervals: () =>
            /** @type {any[]} */ ([]),
    };
    return {
        loadingStatuses,
        paramRuntime: {},
        getBaseUrl: () => "",
        getScaleResolution: () => ({
            getDomain: () => [0, 10],
            getScale: () => ({ genome: () => genome }),
        }),
        isVisible: () => true,
        context: {
            dataFlow: {
                loadingStatusRegistry: {
                    set: (
                        /** @type {any} */ _view,
                        /** @type {import("../../../types/viewContext.js").DataLoadingStatus} */ status
                    ) => loadingStatuses.push(status),
                },
            },
        },
    };
}

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("UrlDescriptorWindowedSource", () => {
    it("defers descriptor and handle work until a window is requested", async () => {
        vi.useFakeTimers();
        vi.stubGlobal("window", { setTimeout, clearTimeout });
        const calls = createCalls();
        const source = new TestSource("window", calls, createViewStub());

        expect(calls.modules).not.toHaveBeenCalled();
        source.onDomainChanged([0, 10]);
        await vi.runAllTimersAsync();

        expect(calls.modules).toHaveBeenCalledOnce();
        expect(calls.handles).toHaveBeenCalledOnce();
        expect(calls.loads).toHaveBeenCalledWith([0, 20]);
    });

    it.each(/** @type {const} */ (["domain", "window"]))(
        "leaves a pending %s debounce inert after disposal",
        async (mode) => {
            vi.useFakeTimers();
            vi.stubGlobal("window", { setTimeout, clearTimeout });
            const calls = createCalls();
            const view = createViewStub();
            const source = new TestSource(mode, calls, view);

            source.onDomainChanged([0, 10]);
            source.dispose();
            await vi.runAllTimersAsync();

            expect(calls.modules).not.toHaveBeenCalled();
            expect(calls.handles).not.toHaveBeenCalled();
            expect(calls.loads).not.toHaveBeenCalled();
            expect(view.loadingStatuses).toEqual([]);
        }
    );
});
