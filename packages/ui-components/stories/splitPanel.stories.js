import { html } from "lit";
import "@genome-spy/ui-components/define/splitPanel";

export default {
    title: "Components/SplitPanel",
    component: "gs-split-panel",
    tags: ["autodocs"],
    args: { orientation: "horizontal", reverse: false },
    argTypes: {
        orientation: { control: "select", options: ["horizontal", "vertical"] },
        reverse: { control: "boolean" },
    },
};

export const Resizable = {
    /** @param {{orientation: string, reverse: boolean}} args */
    render: ({ orientation, reverse }) => html`
        <gs-split-panel
            .orientation=${orientation}
            ?reverse=${reverse}
            style="max-inline-size: 40rem; height: 16rem; border: 1px solid var(--gs-split-panel-divider, #ddd);"
        >
            <section
                slot="preview"
                data-pane-label="Preview"
                style="padding: 1rem;"
            >
                Preview
            </section>
            <section
                slot="settings"
                data-pane-label="Settings"
                style="padding: 1rem;"
            >
                Settings
            </section>
        </gs-split-panel>
    `,
};
