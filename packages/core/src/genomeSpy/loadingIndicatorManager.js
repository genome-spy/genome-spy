import { html, nothing, render } from "lit";
import { styleMap } from "lit/directives/style-map.js";
import { iterateDataDependencies } from "../data/dataReadiness.js";
import DataSource from "../data/sources/dataSource.js";
import UnitView from "../view/unitView.js";
import { formatSpecLocation } from "../utils/errorPresentation.js";
import SPINNER from "../img/90-ring-with-bg.svg";

export default class LoadingIndicatorManager {
    /** @type {HTMLElement} */
    #element;

    /** @type {import("./loadingStatusRegistry.js").default} */
    #registry;

    /** @type {() => import("../view/view.js").default | undefined} */
    #getRoot;

    /** @type {() => void} */
    #unsubscribe;

    /** @type {ReturnType<typeof setTimeout> | undefined} */
    #hideTimeout;

    /**
     * @param {HTMLElement} element
     * @param {import("./loadingStatusRegistry.js").default} registry
     * @param {() => import("../view/view.js").default | undefined} getRoot
     */
    constructor(element, registry, getRoot) {
        this.#element = element;
        this.#registry = registry;
        this.#getRoot = getRoot;
        this.#unsubscribe = registry.observe(() => this.updateLayout());
        this.updateLayout();
    }

    destroy() {
        this.#unsubscribe();
        clearTimeout(this.#hideTimeout);
    }

    /** Derive placement from live consumers, never the source's original owner. */
    #getStatuses() {
        const statuses = Array.from(this.#registry.entries());
        this.#getRoot()?.visit((view) => {
            if (!(view instanceof UnitView) || !view.isVisible()) return;
            const collector = view.flowHandle?.collector;
            if (!collector) return;

            /** @type {import("./loadingStatusRegistry.js").LoadingStatus | undefined} */
            let status;
            for (const node of iterateDataDependencies(collector)) {
                if (!(node instanceof DataSource)) continue;
                const entry = this.#registry.getSource(node);
                if (
                    entry &&
                    (status === undefined ||
                        entry.status === "error" ||
                        (status.status !== "error" &&
                            entry.status === "loading"))
                ) {
                    status = {
                        status: entry.status,
                        detail: [
                            entry.message,
                            formatSpecLocation(entry.errorLocation),
                        ]
                            .filter(Boolean)
                            .join("\n"),
                    };
                }
            }
            if (status) statuses.push([view, status]);
        });
        return statuses;
    }

    updateLayout() {
        const statuses = this.#getStatuses();
        /** @type {import("lit").TemplateResult[]} */
        const indicators = [];
        /** @type {import("./loadingStatusRegistry.js").LoadingStatus | undefined} */
        let fallback;
        let hasVisibleWithCoords = false;

        for (const [view, status] of statuses) {
            const visible = status.status !== "complete";
            if (view.coords) {
                hasVisibleWithCoords ||= visible;
                indicators.push(
                    this.#indicator(status, {
                        left: `${view.coords.x}px`,
                        top: `${view.coords.y}px`,
                        width: `${view.coords.width}px`,
                        height: `${view.coords.height}px`,
                    })
                );
            } else if (visible && (!fallback || status.status === "error")) {
                fallback = status;
            }
        }
        if (fallback && !hasVisibleWithCoords) {
            indicators.push(
                this.#indicator(fallback, {
                    left: "0px",
                    top: "0px",
                    width: "100%",
                    height: "100%",
                })
            );
        }

        clearTimeout(this.#hideTimeout);
        if (statuses.some(([, status]) => status.status !== "complete")) {
            this.#element.style.display = "block";
        } else {
            // Stop invisible spinner animations after their fade-out transition.
            this.#hideTimeout = setTimeout(() => {
                this.#element.style.display = "none";
            }, 3000);
        }
        render(indicators, this.#element);
    }

    /**
     * @param {import("./loadingStatusRegistry.js").LoadingStatus} status
     * @param {Record<string, string>} style
     */
    #indicator(status, style) {
        return html`<div style=${styleMap(style)}>
            <div class=${status.status}>
                ${
                    status.status === "error"
                        ? html`<span
                              >Loading
                              failed${status.detail ? html`: ${status.detail}` : nothing}</span
                          >`
                        : html`<img src=${SPINNER} alt="" /><span
                                  >Loading...</span
                              >`
                }
            </div>
        </div>`;
    }
}
