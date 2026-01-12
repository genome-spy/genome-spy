import { html } from "lit";
import "./configureScaleDialog.js";
import { showDialog } from "../../components/generic/baseDialog.js";

export default {
    title: "Sample View/ConfigureScaleDialog",
    tags: ["autodocs"],
};

// Programmatic demo: buttons that call showDialog and display the result
if (!customElements.get("gs-configure-scale-demo")) {
    class ConfigureScaleDemo extends HTMLElement {
        constructor() {
            super();
            this._root = this.attachShadow({ mode: "open" });
        }

        connectedCallback() {
            this._render();
        }

        _render() {
            this._root.innerHTML = `
                <style>
                    .demo-container {
                        display: flex;
                        flex-direction: column;
                        gap: 1rem;
                        font-family: system-ui, sans-serif;
                        max-width: 800px;
                    }
                    .button-group {
                        display: flex;
                        gap: 0.5rem;
                        flex-wrap: wrap;
                    }
                    button {
                        padding: 0.5rem 1rem;
                        background: #007bff;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 14px;
                    }
                    button:hover {
                        background: #0056b3;
                    }
                    .result-box {
                        padding: 1rem;
                        border: 1px solid #ddd;
                        background: #f8f9fa;
                        border-radius: 4px;
                        min-height: 3rem;
                        font-family: monospace;
                        white-space: pre-wrap;
                        word-break: break-all;
                    }
                    .result-box.empty {
                        color: #6c757d;
                        font-style: italic;
                    }
                </style>
                <div class="demo-container">
                    <div>
                        <h3 style="margin-top: 0;">Scale Configuration Dialog</h3>
                        <p>Click a button to open the dialog with different data types and domains.</p>
                    </div>
                    <div class="button-group">
                        <button id="quantitative">Quantitative (-5 to 5)</button>
                        <button id="quantitative-skewed">Quantitative (-20 to 10)</button>
                        <button id="quantitative-manual">Quant + Manual Colors</button>
                        <button id="quantitative-diverging">Quant + Diverging (DomainMid)</button>
                        <button id="nominal">Nominal (A, B, C, D)</button>
                        <button id="ordinal">Ordinal (Low, Medium, High)</button>
                        <button id="many-categories">Ordinal (10 categories)</button>
                        <button id="reconfigure">Edit Existing Scale</button>
                    </div>
                    <div>
                        <h4>Result:</h4>
                        <div id="result" class="result-box empty">No dialog opened yet</div>
                    </div>
                </div>
            `;

            const resultDiv = this._root.querySelector("#result");

            const showResult = (/** @type {any} */ result) => {
                if (result.ok) {
                    resultDiv.className = "result-box";
                    resultDiv.textContent = JSON.stringify(
                        result.data,
                        null,
                        2
                    );
                } else {
                    resultDiv.className = "result-box";
                    resultDiv.textContent = `Dialog cancelled (reason: ${result.reason || "unknown"})`;
                }
            };

            this._root
                .querySelector("#quantitative")
                .addEventListener("click", async () => {
                    const result = await showDialog(
                        "gs-configure-scale-dialog",
                        (/** @type {any} */ el) => {
                            el.dataType = "quantitative";
                            el.observedDomain = [-5, 5];
                        }
                    );
                    showResult(result);
                });

            this._root
                .querySelector("#quantitative-skewed")
                .addEventListener("click", async () => {
                    const result = await showDialog(
                        "gs-configure-scale-dialog",
                        (/** @type {any} */ el) => {
                            el.dataType = "quantitative";
                            el.observedDomain = [-20, 10];
                        }
                    );
                    showResult(result);
                });

            this._root
                .querySelector("#quantitative-manual")
                .addEventListener("click", async () => {
                    const result = await showDialog(
                        "gs-configure-scale-dialog",
                        (/** @type {any} */ el) => {
                            el.dataType = "quantitative";
                            el.observedDomain = [-10, 0, 10];
                            el.colorMode = "manual";
                            el.domainMode = "explicit";
                            el.quantDomain = [-10, 0, 10];
                            el.quantRange = ["#0000ff", "#ffffff", "#ff0000"];
                        }
                    );
                    showResult(result);
                });

            this._root
                .querySelector("#quantitative-diverging")
                .addEventListener("click", async () => {
                    const result = await showDialog(
                        "gs-configure-scale-dialog",
                        (/** @type {any} */ el) => {
                            el.dataType = "quantitative";
                            el.observedDomain = [-20, 10];
                            el.scheme = "redBlue";
                            el.useDomainMid = true;
                            el.domainMid = 0;
                        }
                    );
                    showResult(result);
                });

            this._root
                .querySelector("#nominal")
                .addEventListener("click", async () => {
                    const result = await showDialog(
                        "gs-configure-scale-dialog",
                        (/** @type {any} */ el) => {
                            el.dataType = "nominal";
                            el.observedDomain = ["A", "B", "C", "D"];
                        }
                    );
                    showResult(result);
                });

            this._root
                .querySelector("#ordinal")
                .addEventListener("click", async () => {
                    const result = await showDialog(
                        "gs-configure-scale-dialog",
                        (/** @type {any} */ el) => {
                            el.dataType = "ordinal";
                            el.observedDomain = ["Low", "Medium", "High"];
                        }
                    );
                    showResult(result);
                });

            this._root
                .querySelector("#many-categories")
                .addEventListener("click", async () => {
                    const result = await showDialog(
                        "gs-configure-scale-dialog",
                        (/** @type {any} */ el) => {
                            el.dataType = "ordinal";
                            el.observedDomain = [
                                "Category 1",
                                "Category 2",
                                "Category 3",
                                "Category 4",
                                "Category 5",
                                "Category 6",
                                "Category 7",
                                "Category 8",
                                "Category 9",
                                "Category 10",
                            ];
                        }
                    );
                    showResult(result);
                });

            this._root
                .querySelector("#reconfigure")
                .addEventListener("click", async () => {
                    const result = await showDialog(
                        "gs-configure-scale-dialog",
                        (/** @type {any} */ el) => {
                            // Pre-populate with an existing scale configuration
                            el.dataType = "quantitative";
                            el.observedDomain = [-5, 5];
                            el.scale = {
                                type: "linear",
                                domainMid: 0,
                                range: ["#0000ff", "#d3d3d3", "#ff0000"],
                            };
                        }
                    );
                    showResult(result);
                });
        }
    }
    customElements.define("gs-configure-scale-demo", ConfigureScaleDemo);
}

export const Interactive = {
    render: () => html`<gs-configure-scale-demo></gs-configure-scale-demo>`,
};
