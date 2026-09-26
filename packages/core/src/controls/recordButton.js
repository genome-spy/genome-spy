import { startRecording } from "../recording/recording.js";
import { button } from "./button.js";
import downloadBlob from "./downloadBlob.js";

/**
 * Creates an experimental, silent plot-video download control with pause/resume.
 * @param {{filename?: string}} [options] Filename without extension.
 * @returns {import("../controls.js").Control}
 */
export function recordButton(options = {}) {
    return {
        mount(context) {
            /** @type {import("../types/embedApi.js").RecordingSession | undefined} */
            let session;
            let disposed = false;
            /** @type {ReturnType<typeof setInterval> | undefined} */
            let countdown;
            const doc = context.container.ownerDocument;
            const group = doc.createElement("span");
            group.className = "recording-controls";
            const style = doc.createElement("style");
            style.textContent = `
                :host .buttons:has([data-recording]) {
                    opacity: 1;
                    pointer-events: auto;
                }
                .recording-controls { display: inline-flex; gap: 3px; }
                .recording-controls > [hidden] { display: none; }
                button.record-button { color: #b42318; font-variant-numeric: tabular-nums; }
            `;

            function clearCountdown() {
                clearInterval(countdown);
                countdown = undefined;
            }

            function updateControls() {
                const paused = session?.paused ?? false;
                element.textContent = session
                    ? "■ " + Math.ceil(session.remainingMs / 1000)
                    : "●";
                element.ariaLabel = session ? "Stop recording" : "Record";
                element.ariaPressed = String(!!session);
                element.title = !session
                    ? "Record plot video"
                    : paused
                      ? "Recording paused — stop and download"
                      : "Stop and download recording";
                element.toggleAttribute("data-recording", !!session);
                pauseElement.hidden = !session;
                pauseElement.textContent = paused ? "▶" : "Ⅱ";
                pauseElement.title = paused
                    ? "Resume recording"
                    : "Pause recording";
                pauseElement.ariaLabel = pauseElement.title;
                pauseElement.ariaPressed = String(paused);
            }

            /** @param {import("../types/embedApi.js").RecordingSession} active */
            async function finish(active) {
                try {
                    const blob = await active.finished;
                    if (disposed || context.signal.aborted) return;
                    downloadBlob(
                        doc,
                        blob,
                        (options.filename ?? "genomespy") + ".webm"
                    );
                    context.showStatus("");
                } catch (error) {
                    if (disposed || context.signal.aborted) return;
                    if (
                        error instanceof DOMException &&
                        error.name === "AbortError"
                    ) {
                        context.showStatus("");
                    } else {
                        context.reportError(error);
                    }
                } finally {
                    clearCountdown();
                    session = undefined;
                    if (!disposed && !context.signal.aborted) {
                        element.disabled = false;
                        updateControls();
                    }
                }
            }

            const mounted = button({
                label: "Record",
                title: "Record plot video",
                async onClick() {
                    if (session) {
                        clearCountdown();
                        pauseElement.disabled = true;
                        element.textContent = "■ …";
                        element.ariaLabel = "Finishing recording";
                        await session.stop().catch(() => {});
                    } else {
                        session = startRecording(context.api);
                        pauseElement.disabled = false;
                        updateControls();
                        countdown = setInterval(updateControls, 250);
                        void finish(session);
                    }
                },
            }).mount(context);
            const element = /** @type {HTMLButtonElement} */ (mounted.element);
            element.classList.add("record-button");
            const pauseControl = button({
                label: "Pause recording",
                onClick() {
                    if (session.paused) {
                        session.resume();
                    } else {
                        session.pause();
                    }
                    updateControls();
                },
            }).mount(context);
            const pauseElement = /** @type {HTMLButtonElement} */ (
                pauseControl.element
            );
            updateControls();
            group.append(style, element, pauseElement);
            return {
                element: group,
                dispose() {
                    disposed = true;
                    clearCountdown();
                    session?.cancel();
                    mounted.dispose();
                    pauseControl.dispose();
                },
            };
        },
    };
}
