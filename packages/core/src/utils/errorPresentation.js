import ViewError from "../view/viewError.js";
import { getSpecErrorLocation } from "./specError.js";

/** @param {import("../types/embedApi.js").SpecLocation | undefined} location */
export function formatSpecLocation(location) {
    if (!location) return "";
    return `Specification: ${JSON.stringify(location.origin)}${
        location.path?.length
            ? `, property: ${JSON.stringify(location.path)}`
            : ""
    }`;
}

/** @param {unknown} error */
export function formatErrorMessage(error) {
    const message =
        error instanceof ViewError
            ? `At "${error.view.getPathString()}": ${error}`
            : String(error);
    return [message, formatSpecLocation(getSpecErrorLocation(error))]
        .filter(Boolean)
        .join("\n");
}

/**
 * Logs explicit declaration context while retaining the native Error object.
 *
 * @param {unknown} error
 */
export function logError(error) {
    const location = formatSpecLocation(getSpecErrorLocation(error));
    if (location) console.error(location, error);
    else console.error(error);
}
