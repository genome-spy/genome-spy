import { afterEach, describe, expect, it, vi } from "vitest";
import IntervalUrlSource from "./intervalUrlSource.js";
import { annotateSpecError } from "../../../utils/specError.js";
import { makeParamRuntimeProvider } from "../../flowTestUtils.js";

/** @extends {IntervalUrlSource<object, import("../../flowNode.js").Datum[][]>} */
class TestSource extends IntervalUrlSource {
    /**
     * @param {"domain" | "window"} debounceMode
     * @param {{ modules: () => Promise<undefined>, handles: () => Promise<object>, loads: (interval: number[]) => void, dispose: (handle: object) => Promise<void> }} calls
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
            disposeHandle: calls.dispose,
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
        dispose: vi.fn(async (/** @type {object} */ _handle) => {}),
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
        ...makeParamRuntimeProvider(),
        getBaseUrl: () => "",
        getScaleResolution: () => ({
            getDomain: () => [0, 10],
            getScale: () => ({ genome: () => genome }),
        }),
        isVisible: () => true,
        context: {
            dataFlow: {
                loadingStatusRegistry: {
                    setSource: (
                        /** @type {any} */ _view,
                        /** @type {import("../../../types/viewContext.js").DataLoadingStatus} */ status
                    ) => loadingStatuses.push(status),
                },
            },
        },
    };
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("IntervalUrlSource", () => {
    it("preserves a downstream declaration location in processing failures", async () => {
        const view = createViewStub();
        const report = vi.spyOn(
            view.context.dataFlow.loadingStatusRegistry,
            "setSource"
        );
        const location = { origin: "encoding", path: ["field"] };
        const error = annotateSpecError(new Error("missing field"), location);
        const consoleError = vi
            .spyOn(console, "error")
            .mockImplementation(() => {});
        class FailingPublicationSource extends TestSource {
            publishInterval() {
                throw error;
            }
        }
        const source = new FailingPublicationSource(
            "window",
            createCalls(),
            view
        );

        await source.requestInterval([0, 10]);
        expect(report).toHaveBeenLastCalledWith(
            source,
            "error",
            "missing field",
            "processing",
            location
        );
        expect(consoleError).toHaveBeenCalledExactlyOnceWith(
            expect.stringContaining('Specification: "encoding"'),
            error
        );
        source.dispose();
    });

    it("defers descriptor and handle work until a window is requested", async () => {
        vi.useFakeTimers();
        vi.stubGlobal("window", { setTimeout, clearTimeout });
        const calls = createCalls();
        const view = createViewStub();
        const source = new TestSource("window", calls, view);

        expect(calls.modules).not.toHaveBeenCalled();
        source.onDomainChanged([0, 10]);
        await vi.runAllTimersAsync();

        expect(calls.modules).toHaveBeenCalledOnce();
        expect(calls.handles).toHaveBeenCalledOnce();
        expect(calls.loads).toHaveBeenCalledWith([0, 20]);
        expect(view.loadingStatuses).toEqual(["loading", "complete"]);
        expect(source.isDataReadyForDomain({ x: [0, 10] })).toBe(true);
        source.dispose();
    });

    it("rejects multiple descriptors from a single-file source", async () => {
        const consoleError = vi
            .spyOn(console, "error")
            .mockImplementation(() => {});
        const calls = createCalls();
        const view = createViewStub();
        const source = new TestSource("domain", calls, view);
        source.params.url = /** @type {any} */ (["a", "b"]);

        await source.requestInterval([0, 10]);

        expect(view.loadingStatuses.at(-1)).toBe("error");
        expect(calls.modules).not.toHaveBeenCalled();
        expect(consoleError).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                message: expect.stringContaining(
                    "supports exactly one resolved URL"
                ),
            })
        );
        source.dispose();
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
            expect(vi.getTimerCount()).toBe(0);
            await vi.runAllTimersAsync();

            expect(calls.modules).not.toHaveBeenCalled();
            expect(calls.handles).not.toHaveBeenCalled();
            expect(calls.loads).not.toHaveBeenCalled();
            expect(view.loadingStatuses).toEqual([]);
        }
    );

    it("waits for every handle to close even when one close fails", async () => {
        const calls = createCalls();
        const source = new TestSource("window", calls, createViewStub());
        const closing = Promise.withResolvers();
        const error = new Error("Cannot close first handle");
        calls.dispose
            .mockRejectedValueOnce(error)
            .mockImplementationOnce(() => closing.promise);
        await source.requestInterval([0, 10]);
        source.params.url = "other";
        await source.requestInterval([10, 20]);

        source.dispose();
        let settled = false;
        const cleanup = source.whenDisposed().finally(() => {
            settled = true;
        });
        const rejected = expect(cleanup).rejects.toBe(error);
        await vi.waitFor(() => expect(calls.dispose).toHaveBeenCalledTimes(2));
        expect(settled).toBe(false);

        closing.resolve(undefined);
        await rejected;
    });
});
