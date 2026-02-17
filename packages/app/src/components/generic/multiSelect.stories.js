import { LitElement, css, html } from "lit";
import "./multiSelect.js";

const COLUMNS = [
    "TP53",
    "MYC",
    "EGFR",
    "BRCA1",
    "BRCA2",
    "PTEN",
    "KRAS",
    "ALK",
    "BRAF",
    "PIK3CA",
    "CDKN2A",
    "ARID1A",
    "RB1",
    "ATM",
    "ERBB2",
    "GATA3",
];

export default {
    title: "Components/MultiSelect",
    tags: ["autodocs"],
    args: {
        allowUnknown: false,
        placeholder: "Search columns",
        debounceMs: 180,
        maxSuggestions: 10,
    },
    argTypes: {
        allowUnknown: { control: { type: "boolean" } },
        placeholder: { control: { type: "text" } },
        debounceMs: { control: { type: "number", min: 0, max: 1000 } },
        maxSuggestions: { control: { type: "number", min: 1, max: 100 } },
    },
};

if (!customElements.get("gs-multi-select-demo")) {
    class MultiSelectDemo extends LitElement {
        static properties = {
            allowUnknown: { type: Boolean, attribute: "allow-unknown" },
            placeholder: { type: String },
            debounceMs: { type: Number, attribute: "debounce-ms" },
            maxSuggestions: { type: Number, attribute: "max-suggestions" },
            _selected: { state: true },
        };

        static styles = css`
            .stack {
                display: grid;
                gap: 0.5rem;
                max-width: 620px;
                padding: 1rem;
            }

            .selected {
                font-size: 0.92rem;
                color: #4c4c4c;
            }
        `;

        constructor() {
            super();
            this.allowUnknown = false;
            this.placeholder = "Search columns";
            this.debounceMs = 180;
            this.maxSuggestions = 10;
            this._selected = ["TP53"];
        }

        /**
         * @param {string} query
         * @returns {Promise<string[]>}
         */
        async #search(query) {
            await new Promise((resolve) => window.setTimeout(resolve, 120));
            const term = query.trim().toLowerCase();
            if (term.length === 0) {
                return COLUMNS;
            }
            return COLUMNS.filter((column) =>
                column.toLowerCase().includes(term)
            );
        }

        render() {
            return html`
                <div class="stack">
                    <gs-multi-select
                        .selectedValues=${this._selected}
                        .search=${(/** @type {string} */ query) =>
                            this.#search(query)}
                        .placeholder=${this.placeholder}
                        .debounceMs=${this.debounceMs}
                        .maxSuggestions=${this.maxSuggestions}
                        ?allowUnknown=${this.allowUnknown}
                        @change=${(/** @type {Event} */ event) => {
                            const change =
                                /** @type {import("./multiSelect.js").MultiSelectChangeEvent} */ (
                                    event
                                );
                            this._selected = change.values;
                        }}
                    ></gs-multi-select>
                    <div class="selected">
                        Selected:
                        ${this._selected.length > 0
                            ? this._selected.join(", ")
                            : "none"}
                    </div>
                </div>
            `;
        }
    }

    customElements.define("gs-multi-select-demo", MultiSelectDemo);
}

export const Basic = {
    render: (/** @type {any} */ args) => html`
        <gs-multi-select-demo
            ?allow-unknown=${args.allowUnknown}
            placeholder=${args.placeholder}
            debounce-ms=${args.debounceMs}
            max-suggestions=${args.maxSuggestions}
        ></gs-multi-select-demo>
    `,
};
