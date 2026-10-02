import { afterEach, expect, it, vi } from "vitest";
import { attachCaptureTarget } from "../embedCapture.js";
import { startRecording } from "./recording.js";
import { startCanvasRecording } from "./canvasRecording.js";

vi.mock("./canvasRecording.js", () => ({ startCanvasRecording: vi.fn() }));
afterEach(() => vi.resetAllMocks());

it("connects the session to embed disposal", () => {
    const api = /** @type {import("../types/embedApi.js").EmbedResult} */ ({});
    let disposed = false;
    /** @type {() => void} */
    let dispose;
    const unsubscribe = vi.fn();
    const target = {
        canvas: {},
        render: vi.fn(),
        /** @param {() => void} capture @param {() => void} onDispose */
        subscribe(capture, onDispose) {
            dispose = onDispose;
            return unsubscribe;
        },
    };
    const runtime = /** @type {any} */ ({
        getCanvasCaptureTarget() {
            if (disposed) throw new Error("Cannot capture a finalized embed.");
            return target;
        },
    });
    attachCaptureTarget(api, () => runtime.getCanvasCaptureTarget());
    const session = /** @type {any} */ ({ cancel: vi.fn() });
    vi.mocked(startCanvasRecording).mockImplementation((canvas, subscribe) => {
        subscribe(() => {});
        return session;
    });
    expect(startRecording(api)).toBe(session);
    disposed = true;
    dispose();
    expect(session.cancel).toHaveBeenCalledOnce();
    expect(() => startRecording(api)).toThrow("finalized");
});

it("does not retain a session when startup fails", () => {
    const api = /** @type {any} */ ({});
    attachCaptureTarget(api, () => /** @type {any} */ ({}));
    vi.mocked(startCanvasRecording).mockImplementation(() => {
        throw new Error("Unsupported format");
    });
    expect(() => startRecording(api)).toThrow("Unsupported format");
    expect(() => startRecording(api)).toThrow("Unsupported format");
});
