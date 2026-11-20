import { html } from "lit";
import "@genome-spy/ui-components/define/jobProgress";

/** @param {Event} event */
function requestCancellation(event) {
    const element =
        /** @type {import("@genome-spy/ui-components/jobProgress").default} */ (
            event.currentTarget
        );
    element.activity = { ...element.activity, status: "cancelling" };
}

export default {
    title: "Components/JobProgress",
    component: "gs-job-progress",
    tags: ["autodocs"],
    args: { label: "Downloading dataset", progress: 0.42, complete: false },
    argTypes: {
        progress: { control: { type: "number", min: 0, max: 1, step: 0.01 } },
    },
    /** @param {{label: string, progress: number | null, complete: boolean}} args */
    render: ({ label, progress, complete }) => {
        const startedAt = Date.now() - 12000;
        /** @type {import("@genome-spy/ui-components/jobProgress").JobProgressState} */
        const activity = complete
            ? { label, startedAt, status: "complete", finishedAt: Date.now() }
            : { label, startedAt, status: "running" };
        return html`
            <gs-job-progress
                style="max-inline-size: 24rem"
                .activity=${activity}
                .progress=${progress}
                @gs-job-cancel=${requestCancellation}
            ></gs-job-progress>
        `;
    },
};

export const Determinate = {};

export const Indeterminate = {
    args: { label: "Preparing preview", progress: null },
};

export const Complete = {
    args: { label: "Download", progress: 1, complete: true },
};
