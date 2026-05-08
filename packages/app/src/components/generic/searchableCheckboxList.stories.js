import { LitElement, css, html, nothing } from "lit";
import { styleMap } from "lit/directives/style-map.js";
import "./searchableCheckboxList.js";

const CATEGORIES = [
    ["primary", "#4c78a8"],
    ["relapse", "#f58518"],
    ["metastasis", "#e45756"],
    ["normal", "#72b7b2"],
    ["control", "#54a24b"],
    ["unknown", "#b279a2"],
    ["treated", "#ff9da6"],
    ["untreated", "#9d755d"],
    ["resistant", "#bab0ac"],
    ["sensitive", "#59a14f"],
];

const ITEMS = CATEGORIES.map(([value]) => ({
    value,
    label: value,
    searchText: value.toLowerCase(),
}));

export default {
    title: "Components/SearchableCheckboxList",
    tags: ["autodocs"],
    args: {
        selectedItemName: "categories",
        showMarkers: true,
    },
    argTypes: {
        selectedItemName: { control: { type: "text" } },
        showMarkers: { control: { type: "boolean" } },
    },
};

if (!customElements.get("gs-searchable-checkbox-list-demo")) {
    class SearchableCheckboxListDemo extends LitElement {
        static properties = {
            selectedItemName: { type: String, attribute: "selected-item-name" },
            showMarkers: { type: Boolean, attribute: "show-markers" },
            _selected: { state: true },
        };

        static styles = css`
            .stack {
                display: grid;
                gap: 0.5rem;
                max-width: 360px;
                padding: 1rem;
            }

            .selected {
                font-size: 0.92rem;
                color: #4c4c4c;
            }
        `;

        constructor() {
            super();
            this.selectedItemName = "categories";
            this.showMarkers = true;
            /** @type {import("@genome-spy/core/spec/channel.js").Scalar[]} */
            this._selected = ["primary", "relapse"];
        }

        /** @param {import("@genome-spy/core/spec/channel.js").Scalar} value */
        #marker(value) {
            if (!this.showMarkers) {
                return nothing;
            }

            const category = CATEGORIES.find(
                ([candidate]) => candidate === value
            );
            return html`<span
                class="color"
                style=${styleMap({
                    backgroundColor: category?.[1] ?? "#ccc",
                })}
            ></span>`;
        }

        render() {
            return html`
                <div class="stack">
                    <gs-searchable-checkbox-list
                        .items=${ITEMS}
                        .selectedValues=${this._selected}
                        .selectedItemName=${this.selectedItemName}
                        .itemMarker=${(
                            /** @type {import("@genome-spy/core/spec/channel.js").Scalar} */ value
                        ) => this.#marker(value)}
                        @change=${(/** @type {Event} */ event) => {
                            const change =
                                /** @type {import("./searchableCheckboxList.js").SearchableCheckboxListChangeEvent} */ (
                                    event
                                );
                            this._selected = change.values;
                        }}
                    ></gs-searchable-checkbox-list>
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

    customElements.define(
        "gs-searchable-checkbox-list-demo",
        SearchableCheckboxListDemo
    );
}

export const Basic = {
    render: (/** @type {any} */ args) => html`
        <gs-searchable-checkbox-list-demo
            selected-item-name=${args.selectedItemName}
            ?show-markers=${args.showMarkers}
        ></gs-searchable-checkbox-list-demo>
    `,
};
