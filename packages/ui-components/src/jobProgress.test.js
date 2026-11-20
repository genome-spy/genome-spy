// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import "./define/jobProgress.js";

afterEach(() => {
    document.body.replaceChildren();
    vi.useRealTimers();
});

test("reports determinate progress and emits a cancel request across a shadow root", async () => {
    const progress = createProgress();
    const host = document.createElement("div");
    host.attachShadow({ mode: "open" }).append(progress);
    document.body.append(host);
    const onCancel = vi.fn();
    host.addEventListener("gs-job-cancel", onCancel);
    await progress.updateComplete;

    const track = progress.shadowRoot.querySelector('[role="progressbar"]');
    expect(track.getAttribute("aria-label")).toBe("Preparing preview");
    expect(track.hasAttribute("aria-valuenow")).toBe(false);

    const values = /** @type {const} */ ([
        [0.25, "25"],
        [1.1, "100"],
        [-0.1, "0"],
    ]);
    for (const [fraction, percent] of values) {
        progress.progress = fraction;
        await progress.updateComplete;
        expect(track.getAttribute("aria-valuenow")).toBe(percent);
    }

    const cancel = progress.shadowRoot.querySelector("button");
    cancel.click();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(progress.activity.status).toBe("running");

    progress.activity = { ...progress.activity, status: "cancelling" };
    await progress.updateComplete;
    expect(cancel.disabled).toBe(true);
    expect(
        progress.shadowRoot.querySelector('[role="status"]').textContent
    ).toBe("Cancellation requested…");
});

test("elapsed time resumes from timestamps and freezes at the terminal state", async () => {
    vi.useFakeTimers();
    const progress = createProgress();
    document.body.append(progress);
    await progress.updateComplete;

    const elapsed = progress.shadowRoot.querySelector('[part="elapsed"]');
    expect(elapsed.textContent.trim()).toBe("Elapsed 1:05");
    await vi.advanceTimersByTimeAsync(1000);
    expect(elapsed.textContent.trim()).toBe("Elapsed 1:06");

    progress.remove();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(4000);
    document.body.append(progress);
    await progress.updateComplete;
    expect(elapsed.textContent.trim()).toBe("Elapsed 1:10");

    progress.activity = {
        ...progress.activity,
        status: "cancelled",
        finishedAt: Date.now(),
    };
    await progress.updateComplete;
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(3000);
    expect(elapsed.textContent.trim()).toBe("Elapsed 1:10");
    expect(
        progress.shadowRoot
            .querySelector('[role="progressbar"]')
            .getAttribute("aria-hidden")
    ).toBe("true");
});

function createProgress() {
    const progress = /** @type {import("./jobProgress.js").default} */ (
        document.createElement("gs-job-progress")
    );
    progress.activity = {
        label: "Preparing preview",
        startedAt: Date.now() - 65000,
        status: "running",
    };
    return progress;
}
