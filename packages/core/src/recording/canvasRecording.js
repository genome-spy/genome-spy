const RECORDING_DURATION_MS = 60_000;
const MIME_TYPE = "video/webm;codecs=vp8";
const MAX_BYTES = 64 * 1024 * 1024;
const EMPTY_RECORDING =
    "No video frames were captured. Try a longer recording.";

/**
 * Copies the live surface immediately after painting, before GPU buffers can be
 * discarded. An opaque output canvas flattens transparency onto white and
 * supplies frames during idle periods, preserving wall-clock interaction timing.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {(capture: () => void) => (() => void)} subscribeFrame
 * @param {() => void} render
 * @returns {import("../types/embedApi.js").RecordingSession}
 */
export function startCanvasRecording(canvas, subscribeFrame, render) {
    if (
        typeof canvas.captureStream !== "function" ||
        typeof MediaRecorder === "undefined" ||
        !MediaRecorder.isTypeSupported(MIME_TYPE)
    ) {
        throw new Error(
            "Plot recording requires canvas capture and WebM/VP8 support."
        );
    }
    const doc = canvas.ownerDocument;
    if (doc.hidden || !canvas.width || !canvas.height) {
        throw new Error("Recording requires a visible, nonempty plot.");
    }

    // Settle the current layout before fixing the recording dimensions.
    render();
    const output = doc.createElement("canvas");
    output.width = canvas.width;
    output.height = canvas.height;
    const context = output.getContext("2d", { alpha: false });
    const listeners = new AbortController();
    const { signal } = listeners;
    /** @type {MediaStream | undefined} */
    let stream;
    let unsubscribe = () => {};
    /** @type {Blob[]} */
    const chunks = [];
    /** @type {MediaRecorder} */
    let recorder;
    /** @type {ReturnType<typeof setInterval>} */
    let frameTimer;
    /** @type {ReturnType<typeof setTimeout>} */
    let limitTimer;
    /** @type {ReturnType<typeof setTimeout>} */
    let stopTimer;
    let bytes = 0;
    let settled = false;
    let stopping = false;
    let paused = false;
    let remaining = RECORDING_DURATION_MS;
    let startedAt = performance.now();

    function remainingMs() {
        return paused || stopping || settled
            ? remaining
            : Math.max(0, remaining - (performance.now() - startedAt));
    }

    function startTimers() {
        // Repeat the retained image during idle time without rerendering the plot.
        frameTimer = setInterval(
            () => capture(() => context.drawImage(output, 0, 0)),
            1000 / 30
        );
        limitTimer = setTimeout(stop, remaining);
    }

    /** @param {boolean} expectedPaused */
    function requireActive(expectedPaused) {
        if (settled || stopping || paused !== expectedPaused) {
            throw new Error(
                "Cannot change pause state in the current recording state."
            );
        }
    }
    /** @type {(blob: Blob) => void} */
    let resolve;
    /** @type {(error: unknown) => void} */
    let reject;
    const finished = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    // Callers can use stop() alone; cancellation must not create an unhandled rejection.
    finished.catch(() => {});

    const sizeObserver = new MutationObserver(checkSize);

    function cleanup() {
        listeners.abort();
        sizeObserver.disconnect();
        clearInterval(frameTimer);
        clearTimeout(limitTimer);
        clearTimeout(stopTimer);
        if (recorder) {
            recorder.ondataavailable =
                recorder.onstop =
                recorder.onerror =
                    null;
            if (recorder.state !== "inactive") recorder.stop();
        }
        unsubscribe();
        stream?.getTracks().forEach((track) => track.stop());
        chunks.length = 0;
    }

    /** @param {unknown} error */
    function fail(error) {
        if (settled) {
            return;
        }
        remaining = remainingMs();
        settled = true;
        cleanup();
        reject(error);
    }

    function checkSize() {
        if (canvas.width !== output.width || canvas.height !== output.height) {
            fail(
                new Error("Recording cancelled because the plot was resized.")
            );
        }
    }

    function copyFrame() {
        checkSize();
        if (settled || paused || stopping) {
            return;
        }
        context.fillStyle = "white";
        context.fillRect(0, 0, output.width, output.height);
        context.drawImage(canvas, 0, 0);
    }

    /** @param {() => void} action */
    function capture(action) {
        try {
            action();
        } catch (error) {
            fail(error);
        }
    }

    function stop() {
        if (!settled && !stopping) {
            // Capture the final plot state, then freeze it while encoding finishes.
            if (!paused) {
                capture(render);
            }
            remaining = remainingMs();
            stopping = true;
            clearTimeout(limitTimer);
            if (settled) {
                return finished;
            }
            if (paused) {
                // Finish the retained clip without including edits made while paused.
                recorder.stop();
            } else if (recorder.state !== "recording") {
                fail(new Error(EMPTY_RECORDING));
            } else {
                // Let the capture stream present the last interaction before stopping.
                stopTimer = setTimeout(() => recorder.stop(), 100);
            }
        }
        return finished;
    }

    try {
        // Prime the output before captureStream can enqueue its initial frame.
        copyFrame();
        stream = output.captureStream(30);
        recorder = new MediaRecorder(stream, { mimeType: MIME_TYPE });
        recorder.ondataavailable = (event) => {
            if (event.data.size) {
                chunks.push(event.data);
                bytes += event.data.size;
                if (bytes >= MAX_BYTES) stop();
            }
        };
        recorder.onstop = () => {
            if (!bytes) {
                fail(new Error(EMPTY_RECORDING));
                return;
            }
            const blob = new Blob(chunks, { type: recorder.mimeType });
            settled = true;
            cleanup();
            resolve(blob);
        };
        recorder.onerror = () => {
            fail(new Error("The browser could not encode the recording."));
        };
        for (const track of stream.getTracks()) {
            track.addEventListener(
                "ended",
                () => {
                    fail(new Error("The recording stream ended unexpectedly."));
                },
                { signal }
            );
        }
        doc.addEventListener(
            "visibilitychange",
            () => {
                if (doc.hidden) {
                    fail(
                        new Error(
                            "Recording cancelled because the tab was hidden."
                        )
                    );
                }
            },
            { signal }
        );
        sizeObserver.observe(canvas, {
            attributes: true,
            attributeFilter: ["width", "height"],
        });
        unsubscribe = subscribeFrame(() => capture(copyFrame));
        recorder.start(250);
        startedAt = performance.now();
        startTimers();
    } catch (error) {
        fail(error);
        throw error;
    }

    return {
        finished,
        stop,
        get paused() {
            return paused;
        },
        get remainingMs() {
            return remainingMs();
        },
        pause() {
            requireActive(false);
            recorder.pause();
            remaining = remainingMs();
            paused = true;
            clearInterval(frameTimer);
            clearTimeout(limitTimer);
        },
        resume() {
            requireActive(true);
            recorder.resume();
            paused = false;
            startedAt = performance.now();
            capture(render);
            if (!settled) {
                startTimers();
            }
        },
        cancel() {
            fail(new DOMException("Recording cancelled.", "AbortError"));
        },
    };
}
