import { afterEach, describe, expect, it, vi } from "vitest";
import IntervalUrlSource from "./intervalUrlSource.js";

/** @extends {IntervalUrlSource<object, import("../../flowNode.js").Datum[][]>} */
class TestSource extends IntervalUrlSource {
    /**
     * @param {"domain" | "window"} debounceMode
     * @param {{ modules: () => Promise<undefined>, handles: () => Promise<object>, loads: (interval: number[]) => void }} calls
     * @param {ReturnType<typeof createViewStub>} view
     */
    constructor(debounceMode, calls, view) {
        super(/** @type {any} */ (view), "x");
        this.params = {
            url: "data",
            windowSize: 20,
            debounce: 0,
            debounceMode,
        };
        this.setupUrlLoading({
            singleUrl: true,
            loadModules: calls.modules,
            createHandle: calls.handles,
        });
        this.calls = calls;
    }

    /**
     * @param {number[]} interval
     * @returns {Promise<{interval: number[], data: import("../../flowNode.js").Datum[][]}>}
     */
    async loadWindow(interval) {
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

describe("IntervalUrlSource", () => {
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

    it("rejects multiple descriptors from a single-file source", async () => {
        const calls = createCalls();
        const view = createViewStub();
        const source = new TestSource("domain", calls, view);
        source.params.url = /** @type {any} */ (["a", "b"]);

        await source.requestInterval([0, 10]);

        expect(view.loadingStatuses.at(-1)).toBe("error");
        expect(calls.modules).not.toHaveBeenCalled();
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
