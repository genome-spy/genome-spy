/** @type {import('@storybook/web-components-vite').StorybookConfig} */
const config = {
    stories: [
        "../src/components/generic/**/*.stories.js",
        "../src/sampleView/**/*.stories.js",
    ],
    addons: [
        "@storybook/addon-links",
        "@storybook/addon-essentials",
        "@storybook/addon-docs",
    ],
    framework: {
        name: "@storybook/web-components-vite",
        options: {},
    },
    docs: {
        autodocs: "tag",
    },
};
export default config;
