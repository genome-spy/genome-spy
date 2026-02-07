import css from "../styles/genome-spy.css.js";
import Tooltip from "../utils/ui/tooltip.js";

/**
 * @param {HTMLElement} container
 */
export function createContainerUi(container) {
    container.classList.add("genome-spy");

    const styleElement = document.createElement("style");
    styleElement.innerHTML = css;
    container.appendChild(styleElement);

    const canvasWrapper = element("div", {
        class: "canvas-wrapper",
    });
    container.appendChild(canvasWrapper);

    canvasWrapper.classList.add("loading");

    const loadingIndicatorsElement = element("div", {
        class: "loading-indicators",
    });
    canvasWrapper.appendChild(loadingIndicatorsElement);

    const tooltip = new Tooltip(container);

    return {
        canvasWrapper,
        loadingIndicatorsElement,
        tooltip,
        styleElement,
    };
}

/**
 * @param {HTMLElement} container
 * @param {string} message
 */
export function createMessageBox(container, message) {
    // Uh, need a templating thingy
    const messageBox = document.createElement("div");
    messageBox.className = "message-box";
    const messageText = document.createElement("div");
    messageText.textContent = message;
    messageBox.appendChild(messageText);
    container.appendChild(messageBox);
}

/**
 * @param {string} tag
 * @param {Record<string, any>} attrs
 */
function element(tag, attrs) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (["innerHTML", "innerText", "className"].includes(key)) {
            // @ts-ignore
            el[key] = value;
        }
        el.setAttribute(key, value);
    }
    return el;
}
