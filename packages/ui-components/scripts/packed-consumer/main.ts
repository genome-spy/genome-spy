import {
    BaseDialog,
    createMenuController,
    showDialog,
    type CustomSelect,
    type DataGrid,
    type MultiSelect,
    type ThresholdComparisonInput,
} from "@genome-spy/ui-components";
import "@genome-spy/ui-components/form.css";
import "@genome-spy/ui-components/contextMenu.css";
import "@genome-spy/ui-components/define/multiSelect";
import "@genome-spy/ui-components/define/customSelect";
import "@genome-spy/ui-components/define/thresholdComparisonInput";
import "@genome-spy/ui-components/define/dataGrid";

class FixtureDialog extends BaseDialog {
    renderButtons() {
        return [this.makeButton("Close dialog", () => {})];
    }
}
customElements.define("gs-fixture-dialog", FixtureDialog);

const search = document.querySelector("gs-multi-select") as MultiSelect;
search.debounceMs = 0;
search.search = async (query) => {
    if (query === "unavailable") {
        throw new Error("Search backend unavailable");
    }
    return ["Group A"];
};

const select = document.querySelector("gs-custom-select") as CustomSelect;
select.options = ["Tracks", "Table"];
select.value = "Tracks";

const threshold = document.querySelector(
    "gs-threshold-comparison-input"
) as ThresholdComparisonInput;
threshold.values = [0, 20, 40];

const grid = document.querySelector("gs-data-grid") as DataGrid;
grid.items = Array.from({ length: 200 }, (_, i) => ({
    Sample: `Sample ${i + 1}`,
    Count: i + 1,
}));

document.querySelector("#open-dialog")!.addEventListener("click", async () => {
    const result = await showDialog("gs-fixture-dialog", (dialog) => {
        dialog.dialogTitle = "Dialog lifecycle";
    });
    document.querySelector("#dialog-result")!.textContent = result.reason ?? "";
});

const opener = document.querySelector<HTMLButtonElement>("#open-menu")!;
const menu = createMenuController();
opener.addEventListener("click", () =>
    menu.dropdownMenu(
        {
            label: "Dataset actions",
            mode: "command",
            items: [
                { label: "Import", callback: () => {} },
                { label: "Export", callback: () => {} },
            ],
        },
        opener
    )
);
