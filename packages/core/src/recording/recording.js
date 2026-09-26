import { getCaptureTarget } from "../embedCapture.js";
import { startCanvasRecording } from "./canvasRecording.js";

/**
 * Starts an experimental recording. Importing this module explicitly opts in to
 * recording. Bundlers can omit it when only other controls are used.
 * @param {import("../types/embedApi.js").EmbedResult} api
 * @returns {import("../types/embedApi.js").RecordingSession}
 */
export function startRecording(api) {
    const target = getCaptureTarget(api);
    const session = startCanvasRecording(
        target.canvas,
        (capture) => target.subscribe(capture, () => session.cancel()),
        target.render
    );
    return session;
}
