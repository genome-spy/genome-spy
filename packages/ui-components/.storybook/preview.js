import { html } from "lit";
import { loadCustomElementsManifest } from "./customElements.js";
import "./preview.css";

loadCustomElementsManifest();

export const globalTypes = {
    theme: {
        description: "Component theme",
        toolbar: {
            title: "Theme",
            items: [
                { value: "default", title: "Default" },
                { value: "playground", title: "Playground" },
                { value: "focused-app", title: "Focused app" },
            ],
            dynamicTitle: true,
        },
    },
};

export const initialGlobals = { theme: "default" };

/** @type {import("@storybook/web-components-vite").Decorator[]} */
export const decorators = [
    (story, context) => html`
        <div class="gs-story gs-theme" data-theme=${context.globals.theme}>
            ${story()}
        </div>
    `,
];

export const parameters = {
    options: {
        storySort: {
            order: ["Overview", "Components", "Utilities", "Theming"],
        },
    },
    docs: {
        source: { format: "html" },
    },
};
