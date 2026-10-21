/** @type {import('@storybook/web-components-vite').StorybookConfig} */
const config = {
    stories: ["../src/agent/**/*.stories.js"],
    addons: ["@storybook/addon-links", "@storybook/addon-docs"],
    framework: {
        name: "@storybook/web-components-vite",
        options: {},
    },
};

export default config;
