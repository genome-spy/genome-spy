import { LitElement, html, css } from "lit";
import "./customSelect.js";

/**
 * Storybook: Custom select showing Vega-like color schemes.
 */
export default {
    title: "Components/CustomSelect",
};

/**
 * @param {string[]} colors
 * @returns {string} data URL for a small horizontal palette image
 */
function paletteDataUrl(colors) {
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 14;
    const ctx = /** @type {CanvasRenderingContext2D} */ (
        canvas.getContext("2d")
    );
    const w = canvas.width / colors.length;
    colors.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(Math.floor(i * w), 0, Math.ceil(w), canvas.height);
    });
    return canvas.toDataURL();
}

const schemes = [
    {
        name: "viridis",
        colors: [
            "#440154",
            "#482777",
            "#3f4a8a",
            "#31688e",
            "#26828e",
            "#1f9e89",
            "#35b779",
            "#6ece58",
            "#90d743",
            "#fde725",
        ],
    },
    {
        name: "magma",
        colors: [
            "#000004",
            "#1b0c41",
            "#4f0d73",
            "#7c1d6f",
            "#b52b65",
            "#e03b49",
            "#f66e2b",
            "#fb9f06",
            "#f9c932",
            "#fcfdbf",
        ],
    },
    {
        name: "plasma",
        colors: [
            "#0d0887",
            "#46039f",
            "#7201a8",
            "#9c179e",
            "#bd3786",
            "#d8576b",
            "#ed7953",
            "#fb9f3a",
            "#fdca26",
            "#f0f921",
        ],
    },
    {
        name: "category10",
        colors: [
            "#1f77b4",
            "#ff7f0e",
            "#2ca02c",
            "#d62728",
            "#9467bd",
            "#8c564b",
            "#e377c2",
            "#7f7f7f",
            "#bcbd22",
            "#17becf",
        ],
    },
];

export const ColorSchemeDropdown = () => {
    const renderOption = (
        /** @type {{name: string, colors: string[]}} */ scheme
    ) => html`
        <img
            src=${paletteDataUrl(scheme.colors)}
            alt=${scheme.name}
            style="width: 120px; height: 14px; border: 1px solid #ccc; border-radius: 2px;"
        />
        <span>${scheme.name}</span>
    `;

    return html` <div style="padding: 1rem; display: grid; gap: 1rem;">
        <gs-custom-select
            .options=${schemes}
            .value=${schemes[0].name}
            .getValue=${(/** @type {{name: string}} */ s) => s.name}
            .getLabel=${(/** @type {{name: string}} */ s) => s.name}
            .renderOption=${renderOption}
            @change=${(/** @type {Event} */ e) => {
                const el = /** @type {any} */ (e.currentTarget);
                console.log("Selected value:", el.value);
            }}
        ></gs-custom-select>
    </div>`;
};

class CustomSelectDemo extends LitElement {
    static properties = {
        value: {},
    };

    constructor() {
        super();
        this.value = schemes[0].name;
    }

    static styles = [
        css`
            .row {
                display: grid;
                grid-template-columns: auto 1fr;
                gap: 1rem;
                align-items: center;
            }
            .preview {
                display: inline-flex;
                align-items: center;
                gap: 0.5rem;
            }
        `,
    ];

    render() {
        const renderOption = (
            /** @type {{name: string, colors: string[]}} */ scheme
        ) => html`
            <img
                src=${paletteDataUrl(scheme.colors)}
                alt=${scheme.name}
                style="width: 120px; height: 14px; border: 1px solid #ccc; border-radius: 2px;"
            />
            <span>${scheme.name}</span>
        `;

        const selected = schemes.find((s) => s.name === this.value);

        return html`
            <div class="row">
                <gs-custom-select
                    .options=${schemes}
                    .value=${this.value}
                    .getValue=${(/** @type {{name: string}} */ s) => s.name}
                    .getLabel=${(/** @type {{name: string}} */ s) => s.name}
                    .renderOption=${renderOption}
                    @change=${(/** @type {Event} */ e) => {
                        const el = /** @type {any} */ (e.currentTarget);
                        this.value = el.value;
                    }}
                ></gs-custom-select>

                <div>
                    <div>Selected:</div>
                    ${selected
                        ? html`<div class="preview">
                              <img
                                  src=${paletteDataUrl(selected.colors)}
                                  alt=${selected.name}
                                  style="width: 120px; height: 14px; border: 1px solid #ccc; border-radius: 2px;"
                              />
                              <strong>${selected.name}</strong>
                          </div>`
                        : html`<em>None</em>`}
                </div>
            </div>
        `;
    }
}

customElements.define("demo-custom-select-listener", CustomSelectDemo);

export const WithChangeListener = () => html`
    <demo-custom-select-listener></demo-custom-select-listener>
`;
