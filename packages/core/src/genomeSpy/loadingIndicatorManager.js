import { html, nothing, render } from "lit";
import { styleMap } from "lit/directives/style-map.js";
import SPINNER from "../img/90-ring-with-bg.svg";

export default class LoadingIndicatorManager {
    /**
     * @param {HTMLElement} loadingIndicatorsElement
     */
    constructor(loadingIndicatorsElement) {
        this._loadingIndicatorsElement = loadingIndicatorsElement;

        /**
         * @type {Map<import("../view/view.js").default, { status: import("../types/viewContext.js").DataLoadingStatus, detail?: string }>}
         */
        this._loadingViews = new Map();
    }

    /**
     * @param {import("../view/view.js").default} view
     * @param {import("../types/viewContext.js").DataLoadingStatus} status
     * @param {string} [detail]
     */
    setDataLoadingStatus(view, status, detail) {
        this._loadingViews.set(view, { status, detail });
        this.updateLayout();
    }

    updateLayout() {
        /** @type {import("lit").TemplateResult[]} */
        const indicators = [];

        const isSomethingVisible = () =>
            [...this._loadingViews.values()].some(
                (v) => v.status == "loading" || v.status == "error"
            );

        for (const [view, status] of this._loadingViews) {
            const c = view.coords;
            if (c) {
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

        // Do some hacks to stop css animations of the loading indicators.
        // Otherwise they fire animation frames even when their opacity is zero.
        // TODO: Instead of this, replace the animated spinners with static images.
        // Or even better, once more widely supported, use `allow-discrete`
        // https://developer.mozilla.org/en-US/docs/Web/CSS/transition-behavior
        // to enable transition of the display property.
        if (isSomethingVisible()) {
            this._loadingIndicatorsElement.style.display = "block";
        } else {
            // TODO: Clear previous timeout
            setTimeout(() => {
                if (!isSomethingVisible()) {
                    this._loadingIndicatorsElement.style.display = "none";
                }
            }, 3000);
        }

        render(indicators, this._loadingIndicatorsElement);
    }
}
