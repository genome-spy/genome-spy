import { html } from "lit";
import { showMessageDialog } from "@genome-spy/ui-components/messageDialog";
import "@genome-spy/ui-components/define/segmentedControl";
import "@genome-spy/ui-components/define/multiSelect";
import "@genome-spy/ui-components/define/dropZone";
import "../.storybook/preview.css";
import themeCss from "../.storybook/preview.css?raw";
import "../../app/src/styles/componentTheme.css";
import appThemeCss from "../../app/src/styles/componentTheme.css?raw";
import { showSelectedFiles } from "./fileSelection.js";
import "./theming.css";

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
