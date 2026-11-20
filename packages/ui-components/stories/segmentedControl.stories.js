import { html } from "lit";
import "@genome-spy/ui-components/define/segmentedControl";

/** @typedef {import("@genome-spy/ui-components/segmentedControl").SegmentedControlOption} SegmentedControlOption */

export default {
    title: "Components/SegmentedControl",
    component: "gs-segmented-control",
    tags: ["autodocs"],
    args: {
        label: "Panel layout",
        value: "horizontal",
        options: [
            { value: "horizontal", label: "Side by side" },
            { value: "vertical", label: "Stacked" },
        ],
    },
    /** @param {{ label: string, value: string, options: SegmentedControlOption[] }} args */
    render: ({ label, value, options }) => html`
        <gs-segmented-control
            style="max-inline-size: 24rem"
            .label=${label}
            .value=${value}
            .options=${options}
        ></gs-segmented-control>
    `,
};

export const Layout = {};

export const ComparisonOperators = {
    args: {
        label: "Comparison operator",
        value: "gte",
        options: [
            { value: "lt", label: "<", ariaLabel: "Less than" },
            { value: "lte", label: "≤", ariaLabel: "Less than or equal to" },
            { value: "eq", label: "=", ariaLabel: "Equal to" },
            { value: "gte", label: "≥", ariaLabel: "Greater than or equal to" },
            { value: "gt", label: ">", ariaLabel: "Greater than" },
        ],
    },
};
