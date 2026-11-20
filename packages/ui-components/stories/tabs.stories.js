import { html } from "lit";
import "@genome-spy/ui-components/define/tabs";

const tabs = [
    { value: "summary", label: "Summary" },
    { value: "notes", label: "Notes" },
];

export default {
    title: "Components/Tabs",
    component: "gs-tabs",
    tags: ["autodocs"],
    args: { label: "Dataset details", value: "summary" },
    parameters: {
        docs: {
            description: {
                story:
                    "Use Left and Right Arrow, Home, or End to select a tab. " +
                    "The Notes field keeps its contents when you switch panels.",
            },
        },
    },
};

export const WithPanels = {
    /** @param {{ label: string, value: string }} args */
    render: ({ label, value }) => html`
        <gs-tabs .label=${label} .value=${value} .tabs=${tabs}>
            <p slot="summary">
                The dataset contains 24 samples in three groups.
            </p>
            <label slot="notes">
                Notes
                <input type="text" />
            </label>
        </gs-tabs>
    `,
};
