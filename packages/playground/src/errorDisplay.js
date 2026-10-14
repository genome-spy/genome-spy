import { html, nothing, render } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";
import { faCircleExclamation } from "@fortawesome/free-solid-svg-icons";
import { getSpecErrorLocation } from "@genome-spy/core/utils/specError.js";

/** @param {HTMLElement} container */
export function clearErrorDisplay(container) {
    container.querySelector(":scope > .playground-error")?.remove();
}

/**
 * @param {HTMLElement} container
 * @param {unknown} error
 * @param {() => void} showInEditor
 */
export function showError(container, error, showInEditor) {
    clearErrorDisplay(container);
    const location = getSpecErrorLocation(error);
    const pointer = location
        ? location.origin +
          (location.path ?? [])
              .map(
                  (key) =>
                      "/" +
                      String(key).replaceAll("~", "~0").replaceAll("/", "~1")
              )
              .join("")
        : undefined;
    const display = document.createElement("div");
    display.className = "playground-error";
    display.setAttribute("role", "alert");
    render(
        html`<div class="playground-error-card">
            <h2>${icon(faCircleExclamation).node[0]} Visualization error</h2>
            <p>${error instanceof Error ? error.message : String(error)}</p>
            ${
                pointer === undefined
                    ? nothing
                    : html`<p class="playground-error-location">
                          <span>At <code>${pointer || "(root)"}</code></span>
                          <button type="button" @click=${showInEditor}>
                              Show in editor
                          </button>
                      </p>`
            }
        </div>`,
        display
    );
    container.appendChild(display);
}
