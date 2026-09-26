// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { attachControls } from "../controls.js";
import { recordButton } from "../recording.js";
import { startRecording } from "../recording/recording.js";
vi.mock("../recording/recording.js", () => ({ startRecording: vi.fn() }));

/** @type {(() => void)[]} */
let disposers = [];

afterEach(() => {
    disposers.forEach((dispose) => dispose());
    disposers = [];
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.body.replaceChildren();
});

function setup() {
    vi.useFakeTimers();
    vi.stubGlobal("URL", {
        createObjectURL: vi.fn(() => "blob:recording"),
        revokeObjectURL: vi.fn(),
    });
    const click = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});
    /** @type {(blob: Blob) => void} */
    let resolve;
    /** @type {(error: unknown) => void} */
    let reject;
    const finished = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    let remaining = 60_000;
    let started = performance.now();
    const session = {
        paused: false,
        get remainingMs() {
            return this.paused
                ? remaining
                : remaining - (performance.now() - started);
        },
        pause() {
            remaining = this.remainingMs;
            this.paused = true;
        },
        resume() {
            started = performance.now();
            this.paused = false;
        },
        finished,
        stop: vi.fn(() => {
            resolve(new Blob(["video"]));
            return finished;
        }),
        cancel: vi.fn(() =>
            reject(new DOMException("Cancelled", "AbortError"))
        ),
    };
    const start = vi.mocked(startRecording).mockReturnValue(session);
    const container = document.createElement("div");
    document.body.append(container);
    const controls = attachControls(container, /** @type {any} */ ({}), {
        controls: [recordButton({ filename: "clip" })],
    });
    disposers.push(controls.dispose);
    const button = controls.element.shadowRoot.querySelector("button");
    const status = controls.element.shadowRoot.querySelector('[role="status"]');
    return { controls, button, status, session, start, click, resolve, reject };
}

it("keeps Stop available while recording and downloads once on completion", async () => {
    const { button, session, click, status } = setup();
    button.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(button.disabled).toBe(false);
    expect(button.dataset.recording).toBe("");
    expect(button.getAttribute("aria-label")).toBe("Stop recording");
    button.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(session.stop).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(
        /** @type {HTMLAnchorElement} */ (click.mock.instances[0]).download
    ).toBe("clip.webm");
    expect(button.getAttribute("aria-label")).toBe("Record");
    expect(status.hasAttribute("hidden")).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:recording");
    expect(vi.getTimerCount()).toBe(0);
});

it("handles automatic completion without a Stop click", async () => {
    const { button, resolve, click } = setup();
    button.click();
    resolve(new Blob(["video"]));
    await vi.advanceTimersByTimeAsync(0);
    expect(click).toHaveBeenCalledOnce();
    expect(button.hasAttribute("data-recording")).toBe(false);
});

it("cancels on disposal without a download", async () => {
    const { button, controls, session, click } = setup();
    button.click();
    controls.dispose();
    await vi.advanceTimersByTimeAsync(0);
    expect(session.cancel).toHaveBeenCalledOnce();
    expect(click).not.toHaveBeenCalled();
});

it("reports errors and restores the Record action", async () => {
    const { button, reject, status, click } = setup();
    button.click();
    reject(new Error("Recording cancelled because the plot was resized."));
    await vi.advanceTimersByTimeAsync(0);
    expect(status.textContent).toContain("resized");
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(click).not.toHaveBeenCalled();
});

it("leaves the control usable after unsupported startup", async () => {
    const { button, start, status } = setup();
    start.mockImplementation(() => {
        throw new Error("Unsupported recording");
    });
    button.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(status.textContent).toContain("Unsupported recording");
    expect(button.disabled).toBe(false);
    expect(button.hasAttribute("data-recording")).toBe(false);
});

it("shows remaining seconds in the button without an overlay and clears its timer", async () => {
    const { button, status, controls } = setup();
    button.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(button.textContent).toBe("■ 60");
    expect(status.hasAttribute("hidden")).toBe(true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(button.textContent).toBe("■ 57");
    expect(button.getAttribute("aria-label")).toBe("Stop recording");
    controls.dispose();
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
});

it("uses hover labels and pauses/resumes the button countdown", async () => {
    const { button, controls, session } = setup();
    expect(button.textContent).toBe("●");
    expect(button.title).toBe("Record plot video");
    button.click();
    await vi.advanceTimersByTimeAsync(3000);
    const pause = /** @type {HTMLButtonElement} */ (
        controls.element.shadowRoot.querySelector(
            'button[aria-label="Pause recording"]'
        )
    );
    pause.click();
    await vi.advanceTimersByTimeAsync(5000);
    expect(session.paused).toBe(true);
    expect(button.textContent).toBe("■ 57");
    expect(pause.title).toBe("Resume recording");
    expect(pause.textContent).toBe("▶");
    pause.click();
    await vi.advanceTimersByTimeAsync(2000);
    expect(button.textContent).toBe("■ 55");
    expect(pause.title).toBe("Pause recording");
});
