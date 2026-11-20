/** @type {import("@storybook/web-components-vite").StorybookConfig} */
const config = {
    stories: ["../stories/**/*.stories.js"],
    addons: ["@storybook/addon-docs"],
    framework: {
        name: "@storybook/web-components-vite",
        options: {},
    },
};

export default config;
