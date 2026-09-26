// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startCanvasRecording } from "./canvasRecording.js";
import { startRecording } from "./recording.js";
import { attachCaptureTarget } from "../embedCapture.js";

class Recorder extends EventTarget {
    static isTypeSupported = () => true;
    /** @type {Recorder[]} */
    static instances = [];
    state = "inactive";
    mimeType = "video/webm;codecs=vp8";
    constructor() {
        super();
        Recorder.instances.push(this);
    }
    /** @param {Event} event */
    dispatchEvent(event) {
        // Model native event-handler properties as well as EventTarget listeners.
        const handler = Reflect.get(this, "on" + event.type);
        if (typeof handler === "function") {
            handler.call(this, event);
        }
        return super.dispatchEvent(event);
    }
    start() {
        this.state = "recording";
    }
    pause() {
        this.state = "paused";
    }
    resume() {
        this.state = "recording";
    }
    stop() {
        this.state = "inactive";
        // The last data event arrives asynchronously, before stop.
        setTimeout(() => {
            this.chunk(new Blob(["final frame"]));
            this.dispatchEvent(new Event("stop"));
        }, 0);
    }
    /** @param {Blob} data */
    chunk(data) {
        const event = new Event("dataavailable");
        Object.defineProperty(event, "data", { value: data });
        this.dispatchEvent(event);
    }
}

/** @type {(EventTarget & {stop: ReturnType<typeof vi.fn>})[]} */
let tracks;
/** @type {HTMLCanvasElement} */
let canvas;
/** @type {import("vitest").Mock<(...args: any[]) => void>} */
let draw;
/** @type {import("vitest").Mock<(...args: any[]) => void>} */
let requestRender;
/** @type {import("vitest").Mock<(...args: any[]) => void>} */
let unsubscribe;
/** @type {() => void} */
let capture;
/** @param {() => void} callback */
function subscribeFrame(callback) {
    capture = callback;
    return unsubscribe;
}

beforeEach(() => {
    vi.useFakeTimers();
    tracks = [];
    Recorder.instances = [];
    vi.stubGlobal("MediaRecorder", Recorder);
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    draw = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
        /** @type {any} */ ({ fillRect: vi.fn(), drawImage: draw })
    );
    HTMLCanvasElement.prototype.captureStream = vi.fn(() => {
        const track = Object.assign(new EventTarget(), { stop: vi.fn() });
        tracks.push(track);
        return /** @type {any} */ ({ getTracks: () => [track] });
    });
    canvas = document.createElement("canvas");
    capture = undefined;
    requestRender = vi.fn();
    unsubscribe = vi.fn();
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    delete HTMLCanvasElement.prototype.captureStream;
});

async function start() {
    const session = startCanvasRecording(canvas, subscribeFrame, requestRender);
    await Promise.resolve();
    return session;
}

function expectReleased() {
    expect(tracks).toHaveLength(1);
    tracks.forEach((track) => expect(track.stop).toHaveBeenCalledOnce());
    expect(vi.getTimerCount()).toBe(0);
}

describe("canvas recording", () => {
    it("preserves idle frames and includes the final asynchronous chunk exactly once", async () => {
        const session = await start();
        await vi.advanceTimersByTimeAsync(5000);
        expect(draw.mock.calls.length).toBeGreaterThan(100);
        Recorder.instances[0].chunk(new Blob(["initial frame"]));
        const result = session.stop();
        expect(session.stop()).toBe(result);
        expect(result).toBe(session.finished);
        await vi.advanceTimersByTimeAsync(101);
        const blob = await result;
        expect(blob.size).toBe("initial framefinal frame".length);
        expect(blob.type).toBe("video/webm;codecs=vp8");
        expectReleased();
    });

    it("copies visible paints but does not rerender during idle time", async () => {
        const session = await start();
        capture();
        expect(draw.mock.calls.at(-1)[0]).toBe(canvas);
        await vi.advanceTimersByTimeAsync(1000);
        expect(requestRender).toHaveBeenCalledOnce();
        session.cancel();
        await expect(session.finished).rejects.toMatchObject({
            name: "AbortError",
        });
        await vi.advanceTimersByTimeAsync(1);
        expect(unsubscribe).toHaveBeenCalledOnce();
        expectReleased();
    });

    it("discards cancellation during finalization instead of producing a clip", async () => {
        const session = await start();
        session.stop();
        session.cancel();
        await expect(session.finished).rejects.toMatchObject({
            name: "AbortError",
        });
        await vi.advanceTimersByTimeAsync(1);
        expectReleased();
    });

    it("reports a resized canvas and releases capture", async () => {
        const session = await start();
        canvas.width += 1;
        await expect(session.finished).rejects.toThrow("resized");
        await vi.advanceTimersByTimeAsync(1);
        expectReleased();
    });

    it("cancels when the tab becomes hidden", async () => {
        const session = await start();
        vi.spyOn(document, "hidden", "get").mockReturnValue(true);
        document.dispatchEvent(new Event("visibilitychange"));
        await expect(session.finished).rejects.toThrow("hidden");
        await vi.advanceTimersByTimeAsync(1);
        expectReleased();
    });

    it("exports at the time limit", async () => {
        const session = await start();
        await vi.advanceTimersByTimeAsync(60_101);
        expect((await session.finished).size).toBeGreaterThan(0);
        expectReleased();
    });

    it("exports at the accumulated byte limit", async () => {
        const session = await start();
        // Size drives the limit; no 64-MiB allocation is needed to test the boundary.
        const chunk = new Blob(["data"]);
        Object.defineProperty(chunk, "size", { value: 64 * 1024 * 1024 });
        Recorder.instances[0].chunk(chunk);
        await vi.advanceTimersByTimeAsync(101);
        expect((await session.finished).size).toBeGreaterThan(0);
        expectReleased();
    });

    it.each(["error", "ended"])(
        "releases resources after %s",
        async (event) => {
            const session = await start();
            const target =
                event === "error" ? Recorder.instances[0] : tracks[0];
            target.dispatchEvent(new Event(event));
            await expect(session.finished).rejects.toThrow();
            await vi.advanceTimersByTimeAsync(1);
            expectReleased();
        }
    );

    it("cleans up failed encoder startup", async () => {
        vi.spyOn(Recorder.prototype, "start").mockImplementation(() => {
            throw new Error("encoder failed");
        });
        expect(() =>
            startCanvasRecording(canvas, subscribeFrame, requestRender)
        ).toThrow("encoder failed");
        expectReleased();
        expect(unsubscribe).toHaveBeenCalledOnce();
    });

    it("turns a capture failure into a session error without breaking rendering", async () => {
        const session = await start();
        draw.mockImplementation(() => {
            throw new Error("capture failed");
        });
        expect(() => capture()).not.toThrow();
        await expect(session.finished).rejects.toThrow("capture failed");
        await vi.advanceTimersByTimeAsync(1);
        expectReleased();
    });

    it("rejects an unsupported format before acquiring resources", () => {
        vi.spyOn(Recorder, "isTypeSupported").mockReturnValue(false);
        expect(() =>
            startCanvasRecording(canvas, subscribeFrame, requestRender)
        ).toThrow("WebM/VP8");
        expect(tracks).toHaveLength(0);
    });
});

it("freezes active time and capture while paused, then resumes the remaining limit", async () => {
    const session = await start();
    await vi.advanceTimersByTimeAsync(10_000);
    session.pause();
    expect(session.paused).toBe(true);
    expect(session.remainingMs).toBe(50_000);
    const draws = draw.mock.calls.length;
    capture();
    await vi.advanceTimersByTimeAsync(70_000);
    expect(draw).toHaveBeenCalledTimes(draws);
    expect(session.remainingMs).toBe(50_000);
    expect(Recorder.instances[0].state).toBe("paused");
    session.resume();
    expect(session.paused).toBe(false);
    await vi.advanceTimersByTimeAsync(50_101);
    expect((await session.finished).size).toBeGreaterThan(0);
    expectReleased();
});

it("stops while paused without capturing intervening edits", async () => {
    const session = await start();
    session.pause();
    const draws = draw.mock.calls.length;
    session.stop();
    await vi.advanceTimersByTimeAsync(1);
    expect((await session.finished).size).toBeGreaterThan(0);
    expect(draw).toHaveBeenCalledTimes(draws);
    expectReleased();
    expect(() => session.resume()).toThrow("recording state");
});

it("still cancels a paused session when its canvas is resized", async () => {
    const session = await start();
    session.pause();
    canvas.width += 1;
    await expect(session.finished).rejects.toThrow("resized");
    await vi.advanceTimersByTimeAsync(1);
    expectReleased();
});

it("freezes the final frame when stop is requested", async () => {
    requestRender.mockImplementation(() => capture?.());
    const session = await start();
    const result = session.stop();
    const copies = () =>
        draw.mock.calls.filter(([source]) => source === canvas).length;
    const finalCopies = copies();
    expect(finalCopies).toBeGreaterThan(1);
    capture();
    await vi.advanceTimersByTimeAsync(101);
    await result;
    expect(copies()).toBe(finalCopies);
});

it("allows an immediate restart after cancellation while rejecting concurrent capture", async () => {
    const api = /** @type {import("../types/embedApi.js").EmbedResult} */ ({});
    let active = false;
    attachCaptureTarget(api, () => ({
        canvas,
        render: requestRender,
        subscribe() {
            if (active) throw new Error("A canvas capture is already active.");
            active = true;
            return () => {
                active = false;
            };
        },
    }));
    const first = startRecording(api);
    expect(() => startRecording(api)).toThrow("already active");
    first.cancel();
    const second = startRecording(api);
    second.cancel();
    await expect(first.finished).rejects.toMatchObject({ name: "AbortError" });
    await expect(second.finished).rejects.toMatchObject({ name: "AbortError" });
});
