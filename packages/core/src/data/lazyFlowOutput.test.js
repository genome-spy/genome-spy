import { expect, onTestFinished, test, vi } from "vitest";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import { resolveScopedEmbedParam } from "../paramRuntime/embedParamApi.js";
import FlowNode from "./flowNode.js";
import { registerLazyDataSource } from "./sources/dataSourceFactory.js";
import IntervalUrlSource from "./sources/lazy/intervalUrlSource.js";

/** @typedef {import("./flowNode.js").Datum} Datum */
/**
 * Exercise the production request/publication boundary, controlling only the
 * remote read so cancellation and failure remain deterministic and offline.
 * @extends {IntervalUrlSource<object, Datum[][]>}
 */
class ControlledSource extends IntervalUrlSource {
    /** @type {{ resolve: (result: { interval: number[], data: Datum[][] }) => void, reject: (error: Error) => void }[]} */
    requests = [];

    /**
     * @param {object} params
     * @param {import("../view/view.js").default} view
     */
    constructor(params, view) {
        super(view, "x");
        this.params = {
            url: "controlled",
            debounce: 0,
            debounceMode: "domain",
        };
        this.setupUrlLoading({
            loadModules: async () => /** @type {undefined} */ (undefined),
            createHandle: async () => ({}),
        });
    }

    onDomainChanged() {
        // Tests explicitly start each request after observing the prior state.
    }

    /** @param {number[]} interval */
    loadWindow(interval) {
        return new Promise((resolve, reject) => {
            this.requests.push({ resolve, reject });
        });
    }

    /** @param {number[]} [interval] */
    async beginRequest(interval = [0, 10]) {
        const index = this.requests.length;
        const finished = this.requestInterval(interval);
        await vi.waitFor(() => expect(this.requests).toHaveLength(index + 1));
        const request = this.requests[index];
        return {
            /** @param {Datum[][]} chunks */
            succeed: async (chunks) => {
                request.resolve({ interval, data: chunks });
                await finished;
            },
            fail: async () => {
                request.reject(new Error("remote read failed"));
                await finished;
            },
        };
    }
}

/** @returns {import("../spec/root.js").RootSpec} */
function messageSpec() {
    return {
        width: 300,
        height: 80,
        params: [{ name: "minimum", value: 0 }],
        data: { lazy: /** @type {any} */ ({ type: "flowOutputTest" }) },
        transform: [
            { type: "collect" },
            { type: "filter", expr: "datum.score >= minimum" },
            {
                type: "branch",
                transform: [
                    { type: "aggregate" },
                    { type: "values", field: "count", param: "recordCounts" },
                ],
            },
            { type: "values", field: "x", param: "positions" },
        ],
        layer: [
            {
                name: "signal",
                mark: "point",
                encoding: {
                    x: {
                        field: "x",
                        type: "quantitative",
                        scale: { domain: [0, 10] },
                        axis: null,
                    },
                    y: { value: 0.5 },
                },
            },
            {
                name: "message",
                data: { values: [{}] },
                mark: {
                    type: "text",
                    text: "No data in the last loaded region",
                    opacity: { expr: "recordCounts[0] === 0 ? 1 : 0" },
                },
                encoding: { x: { value: 0.5 }, y: { value: 0.5 } },
            },
        ],
    };
}

/** @param {import("../spec/root.js").RootSpec} [spec] */
async function engine(spec = messageSpec()) {
    onTestFinished(
        registerLazyDataSource(
            (params) => /** @type {any} */ (params).type === "flowOutputTest",
            ControlledSource
        )
    );
    const result = await createHeadlessEngine(spec);
    onTestFinished(() => result.view.disposeSubtree());
    return {
        ...result,
        source: /** @type {ControlledSource} */ (
            result.context.dataFlow.dataSources.find(
                (source) => source instanceof ControlledSource
            )
        ),
    };
}

/** @param {import("../view/view.js").default} view */
function messageOpacity(view) {
    const message = /** @type {import("../view/unitView.js").default} */ (
        view.getDescendants().find((child) => child.name === "message")
    );
    return message.mark.encoders.opacity({});
}

test("lazy aggregation distinguishes initial unknown from first empty success and retains its message", async () => {
    const { view, source } = await engine();
    const runtime = view.paramRuntime;
    const api = resolveScopedEmbedParam(view, "recordCounts");
    const notify = vi.fn();
    onTestFinished(api.subscribe(notify));

    expect(api.getValue()).toEqual([]);
    expect(messageOpacity(view)).toBe(0);
    const first = await source.beginRequest();
    expect(api.getValue()).toEqual([]);
    await first.succeed([[]]);
    await runtime.whenPropagated();
    expect(api.getValue()).toEqual([0]);
    expect(notify).toHaveBeenCalledOnce();
    expect(messageOpacity(view)).toBe(1);

    // Dummy completion and invalidation clear rows without inventing a result.
    await source.load();
    source.invalidateData();
    await runtime.whenPropagated();
    expect(api.getValue()).toEqual([0]);
    expect(notify).toHaveBeenCalledOnce();
    expect(messageOpacity(view)).toBe(1);

    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    onTestFinished(() => log.mockRestore());
    const failed = await source.beginRequest();
    expect(messageOpacity(view)).toBe(1);
    await failed.fail();
    expect(api.getValue()).toEqual([0]);
    expect(messageOpacity(view)).toBe(1);

    const populated = await source.beginRequest();
    await populated.succeed([[{ x: 1, score: 0 }], [{ x: 2, score: 2 }]]);
    await runtime.whenPropagated();
    expect(api.getValue()).toEqual([2]);
    expect(runtime.getValue("positions")).toEqual([1, 2]);
    expect(messageOpacity(view)).toBe(0);
    const signal = view
        .getDescendants()
        .find((child) => child.name === "signal");
    expect(Array.from(signal.flowHandle.collector.getData())).toMatchObject([
        { x: 1, score: 0 },
        { x: 2, score: 2 },
    ]);
    await source.load();
    expect(api.getValue()).toEqual([2]);

    const same = await source.beginRequest();
    await same.succeed([
        [
            { x: 3, score: 3 },
            { x: 4, score: 4 },
        ],
    ]);
    await runtime.whenPropagated();
    expect(notify).toHaveBeenCalledTimes(2);
    expect(runtime.getValue("positions")).toEqual([3, 4]);

    runtime.setValue("minimum", 4);
    await runtime.whenPropagated();
    expect(api.getValue()).toEqual([1]);
    expect(runtime.getValue("positions")).toEqual([4]);
    expect(source.requests).toHaveLength(4);
});

test("failed processing, superseded reads, and disposed reads cannot publish a lazy output", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    onTestFinished(() => log.mockRestore());
    const { view, source } = await engine();
    const runtime = view.paramRuntime;
    const first = await source.beginRequest();
    await first.succeed([[{ x: 1, score: 1 }]]);
    const output = runtime.getOutput("recordCounts");
    const initial = output.value.get();
    const notify = vi.fn();
    onTestFinished(
        resolveScopedEmbedParam(view, "recordCounts").subscribe(notify)
    );

    // This sibling fails after the summary has staged its complete candidate.
    class CompletionFailure extends FlowNode {
        complete() {
            throw new Error("late completion failure");
        }
    }
    const failure = new CompletionFailure();
    source.addChild(failure);
    const broken = await source.beginRequest();
    await broken.succeed([[]]);
    expect(runtime.getValue("recordCounts")).toBe(initial);
    expect(notify).not.toHaveBeenCalled();
    source.removeChild(failure);

    const stale = await source.beginRequest([10, 20]);
    const current = await source.beginRequest([20, 30]);
    await current.succeed([[]]);
    await stale.succeed([
        [
            { x: 11, score: 1 },
            { x: 12, score: 2 },
        ],
    ]);
    await runtime.whenPropagated();
    expect(runtime.getValue("recordCounts")).toEqual([0]);
    expect(runtime.getValue("positions")).toEqual([]);
    expect(notify).toHaveBeenCalledOnce();
    const currentValue = output.value.get();

    const disposed = await source.beginRequest();
    view.disposeSubtree();
    await disposed.succeed([[{ x: 9, score: 9 }]]);
    expect(output.value.get()).toBe(currentValue);
    expect(notify).toHaveBeenCalledOnce();
});

test("a lazy side-input revision publishes only after the primary rows consume it", async () => {
    const spec = messageSpec();
    spec.data = { values: [{ x: 1 }, { x: 2 }] };
    spec.transform = [
        {
            type: "coordinateLookup",
            from: {
                data: { lazy: /** @type {any} */ ({ type: "flowOutputTest" }) },
            },
            key: "x",
            values: ["score"],
        },
        { type: "filter", expr: "datum.score >= minimum" },
        {
            type: "branch",
            transform: [
                { type: "aggregate" },
                { type: "values", field: "count", param: "recordCounts" },
            ],
        },
    ];
    const { view, source } = await engine(spec);
    const runtime = view.paramRuntime;
    expect(runtime.getValue("recordCounts")).toEqual([]);
    const notify = vi.fn();
    onTestFinished(
        resolveScopedEmbedParam(view, "recordCounts").subscribe(notify)
    );

    const first = await source.beginRequest();
    await first.succeed([
        [
            { x: 1, score: 1 },
            { x: 2, score: 2 },
        ],
    ]);
    await runtime.whenPropagated();
    expect(runtime.getValue("recordCounts")).toEqual([2]);

    runtime.setValue("minimum", 2);
    await runtime.whenPropagated();
    expect(runtime.getValue("recordCounts")).toEqual([1]);
    const updated = await source.beginRequest();
    await updated.succeed([
        [
            { x: 1, score: 3 },
            { x: 2, score: 4 },
        ],
    ]);
    await runtime.whenPropagated();
    expect(runtime.getValue("recordCounts")).toEqual([2]);
    const signal = view
        .getDescendants()
        .find((child) => child.name === "signal");
    expect(Array.from(signal.flowHandle.collector.getData())).toMatchObject([
        { x: 1, score: 3 },
        { x: 2, score: 4 },
    ]);
    expect(notify.mock.calls.map(([value]) => value)).toEqual([[2], [1], [2]]);
});
