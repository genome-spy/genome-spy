import { html } from "lit";
import { showMessageDialog } from "@genome-spy/ui-components/messageDialog";
import "@genome-spy/ui-components/define/segmentedControl";
import "@genome-spy/ui-components/define/multiSelect";
import "@genome-spy/ui-components/define/dropZone";
import "@genome-spy/ui-components/define/filePicker";
import "../.storybook/preview.css";
import themeCss from "../.storybook/preview.css?raw";
import "../../app/src/styles/componentTheme.css";
import appThemeCss from "../../app/src/styles/componentTheme.css?raw";
import { showSelectedFiles } from "./fileSelection.js";
import "./theming.css";
import "@genome-spy/ui-components/form.css";
import nativeFormCss from "@genome-spy/ui-components/form.css?raw";

const columns = ["Sample", "Group", "Score", "Status"];
const displayModes = [
    { value: "table", label: "Table" },
    { value: "chart", label: "Chart" },
];

const playground = { theme: "playground", title: "Playground" };
const focusedApps = { theme: "focused-app", title: "Focused apps" };
const defaultTheme = { theme: "default", title: "Shared default" };
const genomeSpyApp = { theme: "app", title: "GenomeSpy App" };

export default {
    title: "Theming/Scoped palettes",
};

/** @param {string} query */
function searchColumns(query) {
    return columns.filter((column) =>
        column.toLowerCase().includes(query.toLowerCase())
    );
}

/** @param {MouseEvent} event */
function openDialog(event) {
    const button = /** @type {HTMLButtonElement} */ (event.currentTarget);
    const mount = /** @type {HTMLElement} */ (button.closest(".gs-theme"));

    void showMessageDialog("Use the selected columns in this preview?", {
        title: "Confirm selection",
        confirm: true,
        mount,
    });
}

/**
 * @param {{theme: string, title: string}[]} palettes
 * @param {string} [cssSource]
 */
function renderPalettes(palettes, cssSource = themeCss) {
    return html`
        <div class="theme-showcase">
            ${palettes.map(
                ({ theme, title }) => html`
                    <section
                        class="gs-theme theme-example ${
                            theme === "app" ? "gs-app-theme" : ""
                        }"
                        data-theme=${theme}
                    >
                        <h2>${title}</h2>
                        <gs-multi-select
                            placeholder="Search columns"
                            .selectedValues=${["Sample"]}
                            .search=${searchColumns}
                        ></gs-multi-select>
                        <gs-segmented-control
                            label="Display mode"
                            value="table"
                            .options=${displayModes}
                        ></gs-segmented-control>
                        <gs-upload-drop-zone
                            accept=".csv,.tsv"
                            @gs-files-chosen=${showSelectedFiles}
                        ></gs-upload-drop-zone>
                        <output></output>
                        <button type="button" @click=${openDialog}>
                            Open themed dialog
                        </button>
                    </section>
                `
            )}
        </div>
        <details class="theme-code">
            <summary>Theme CSS</summary>
            <p>
                Set the custom properties on an ancestor. Pass that element as
                <code>mount</code> to give a dialog the same theme.
            </p>
            <pre><code>${cssSource.trim()}</code></pre>
        </details>
    `;
}

export const Playground = {
    render: () => renderPalettes([playground]),
};

export const FocusedApps = {
    render: () => renderPalettes([focusedApps]),
};

export const SideBySide = {
    render: () => renderPalettes([playground, focusedApps]),
};

export const ButtonStyles = {
    render: () => renderPalettes([defaultTheme, genomeSpyApp], appThemeCss),
};

export const NativeFormControls = {
    render: () => html`
        <div class="theme-showcase">
            <form
                class="theme-example gs-form"
                aria-labelledby="native-form-title"
                @submit=${(/** @type {SubmitEvent} */ event) => event.preventDefault()}
            >
                <h2 id="native-form-title">Native HTML form</h2>
                <label>
                    Dataset name
                    <input name="dataset" type="text" value="Sample cohort" />
                </label>
                <label>
                    Delimiter
                    <select name="delimiter">
                        <option value="comma">Comma</option>
                        <option value="tab">Tab</option>
                    </select>
                </label>
                <label>
                    Notes
                    <textarea name="notes" rows="2"></textarea>
                </label>
                <label>
                    <input name="header" type="checkbox" checked />
                    First row contains column names
                </label>
                <button type="reset">Reset form</button>
            </form>
            <section class="theme-example">
                <h2>GenomeSpy components</h2>
                <gs-multi-select
                    placeholder="Search columns"
                    .selectedValues=${["Sample"]}
                    .search=${searchColumns}
                ></gs-multi-select>
                <div>
                    <gs-file-picker
                        accept=".csv,.tsv"
                        @gs-files-chosen=${showSelectedFiles}
                        >Choose dataset</gs-file-picker
                    >
                    <output></output>
                </div>
            </section>
        </div>
        <details class="theme-code">
            <summary>Native form CSS</summary>
            <p>
                Import <code>@genome-spy/ui-components/form.css</code> and put
                <code>gs-form</code> on your form or a wrapper. Switch the Theme
                toolbar to see the native fields and the components share a
                palette.
            </p>
            <pre><code>${nativeFormCss.trim()}</code></pre>
        </details>
    `,
};
