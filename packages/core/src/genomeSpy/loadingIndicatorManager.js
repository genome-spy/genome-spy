import { html, nothing, render } from "lit";
import { styleMap } from "lit/directives/style-map.js";
import SPINNER from "../img/90-ring-with-bg.svg";

export default class LoadingIndicatorManager {
    /** @type {HTMLElement} */
    #loadingIndicatorsElement;

    /**
     * @type {import("./loadingStatusRegistry.js").default}
     */
    #loadingStatusRegistry;

    /** @type {(() => void) | null} */
    #unsubscribe = null;

    /**
     * @param {HTMLElement} loadingIndicatorsElement
     * @param {import("./loadingStatusRegistry.js").default} loadingStatusRegistry
     */
    constructor(loadingIndicatorsElement, loadingStatusRegistry) {
        this.#loadingIndicatorsElement = loadingIndicatorsElement;

        this.#loadingStatusRegistry = loadingStatusRegistry;

        this.#unsubscribe = this.#loadingStatusRegistry.subscribe(() =>
            this.updateLayout()
        );
        this.updateLayout();
    }

    destroy() {
        if (this.#unsubscribe) {
            this.#unsubscribe();
            this.#unsubscribe = null;
        }
    }

    updateLayout() {
        /** @type {import("lit").TemplateResult[]} */
        const indicators = [];

        const isSomethingVisible = () => {
            for (const [, status] of this.#loadingStatusRegistry.entries()) {
                if (status.status == "loading" || status.status == "error") {
                    return true;
                }
            }
            return false;
        };

        /** @type {{ status: import("../types/viewContext.js").DataLoadingStatus, detail?: string } | undefined} */
        let fallbackStatus;
        let hasVisibleWithCoords = false;

        for (const [view, status] of this.#loadingStatusRegistry.entries()) {
            const isVisible =
                status.status == "loading" || status.status == "error";

            const c = view.coords;
            if (!c && isVisible && !fallbackStatus) {
                fallbackStatus = status;
            }
            if (c) {
                if (isVisible) {
                    hasVisibleWithCoords = true;
                }

                const style = {
                    left: `${c.x}px`,
                    top: `${c.y}px`,
                    width: `${c.width}px`,
                    height: `${c.height}px`,
                };
                indicators.push(
                    html`<div style=${styleMap(style)}>
                        <div class=${status.status}>
                            ${status.status == "error"
                                ? html`<span
                                      >Loading
                                      failed${status.detail
                                          ? html`: ${status.detail}`
                                          : nothing}</span
                                  >`
                                : html`
                                      <img src="${SPINNER}" alt="" />
                                      <span>Loading...</span>
                                  `}
                        </div>
                    </div>`
                );
            }
        }

        if (fallbackStatus && !hasVisibleWithCoords) {
            const style = {
                left: "0px",
                top: "0px",
                width: "100%",
                height: "100%",
            };
            indicators.push(
                html`<div style=${styleMap(style)}>
                    <div class=${fallbackStatus.status}>
                        ${fallbackStatus.status == "error"
                            ? html`<span
                                  >Loading
                                  failed${fallbackStatus.detail
                                      ? html`: ${fallbackStatus.detail}`
                                      : nothing}</span
                              >`
                            : html`
                                  <img src="${SPINNER}" alt="" />
                                  <span>Loading...</span>
                              `}
                    </div>
                </div>`
            );
        }

        // Do some hacks to stop css animations of the loading indicators.
        // Otherwise they fire animation frames even when their opacity is zero.
        // TODO: Instead of this, replace the animated spinners with static images.
        // Or even better, once more widely supported, use `allow-discrete`
        // https://developer.mozilla.org/en-US/docs/Web/CSS/transition-behavior
        // to enable transition of the display property.
        if (isSomethingVisible()) {
            this.#loadingIndicatorsElement.style.display = "block";
        } else {
            // TODO: Clear previous timeout
            setTimeout(() => {
                if (!isSomethingVisible()) {
                    this.#loadingIndicatorsElement.style.display = "none";
                }
            }, 3000);
        }

        render(indicators, this.#loadingIndicatorsElement);
    }
}
