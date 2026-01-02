export default {
    stories: ["../stories/**/*.stories.js"],
    addons: [
        "@storybook/addon-essentials",
        "@storybook/addon-links",
        "@storybook/addon-docs",
    ],
    docs: {
        autodocs: true,
    },
    framework: {
        name: "@storybook/web-components-vite",
        options: {},
    },
    core: {
        disableTelemetry: true,
    },
};
