export default {
    stories: ["../stories/**/*.stories.js"],
    addons: ["@storybook/addon-links", "@storybook/addon-docs"],
    framework: {
        name: "@storybook/web-components-vite",
        options: {},
    },
    core: {
        disableTelemetry: true,
    },
};
