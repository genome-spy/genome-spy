import { expect, test, vi } from "vitest";
import ViewParamRuntime from "../paramRuntime/viewParamRuntime.js";
import { intervalSelection } from "./index.js";

// Real parameter writes and graph effects exercise origin and settled delivery.
test("shared hosts commit only the originating completion and external writes cancel", () => {
    const runtime = new ViewParamRuntime();
    runtime.registerParam({
        name: "brush",
        select: { type: "interval", encodings: ["x"] },
    });
    runtime.registerParam({
        name: "end",
        expr: "brush.intervals.x ? brush.intervals.x[1] : 0",
    });
    runtime.getValue("end");
    const state = runtime.getIntervalSelectionState("brush");
    const host = {};
    const cancel = vi.fn();
    const commits = vi.fn(() =>
        expect(runtime.getValue("end")).toBe(
            runtime.getValue("brush").intervals.x?.[1] ?? 0
        )
    );
    state.subscribeCommit(commits);
    state.begin(host, cancel);
    runtime.setValue("brush", intervalSelection({ x: [1, 2] }), {
        intervalGesture: host,
    });
    expect(commits).not.toHaveBeenCalled();
    state.finish(host, true);
    expect(commits).toHaveBeenCalledTimes(1);

    state.begin(host, cancel);
    runtime.setValue("brush", intervalSelection({ x: [2, 3] }), {
        intervalGesture: host,
    });
    // Even an equal external write invalidates the gesture before ref equality.
    runtime.setValue("brush", runtime.getValue("brush"));
    expect(cancel).toHaveBeenCalledTimes(1);
    state.finish(host, true);
    expect(commits).toHaveBeenCalledTimes(1);
    state.clear();
    expect(commits).toHaveBeenCalledTimes(2);
    expect(runtime.getValue("brush").intervals.x).toBeNull();
    runtime.dispose();
});

test("host takeover and cancellation retain bounds without committing", () => {
    const runtime = new ViewParamRuntime();
    runtime.registerParam({
        name: "brush",
        select: { type: "interval", encodings: ["x"] },
        value: { x: [1, 2] },
    });
    const state = runtime.getIntervalSelectionState("brush");
    const first = {},
        second = {};
    const canceled = vi.fn();
    const commits = vi.fn();
    state.subscribeCommit(commits);
    state.begin(first, canceled);
    runtime.setValue("brush", intervalSelection({ x: [3, 4] }), {
        intervalGesture: first,
    });
    state.begin(second, vi.fn());
    expect(canceled).toHaveBeenCalledOnce();
    expect(runtime.getValue("brush").intervals.x).toEqual([3, 4]);
    state.finish(first, true);
    state.finish(second, false);
    expect(commits).not.toHaveBeenCalled();
    runtime.dispose();
});
