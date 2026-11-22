/** @type {import('@storybook/web-components-vite').StorybookConfig} */
const config = {
    stories: ["../src/sampleView/**/*.stories.js"],
    addons: ["@storybook/addon-links", "@storybook/addon-docs"],
    viteFinal(config) {
        // This verifier expects the complete production App library entry.
        config.plugins = config.plugins?.filter(
            (plugin) =>
                typeof plugin !== "object" ||
                plugin === null ||
                !("name" in plugin) ||
                plugin.name !== "verify-lazy-figwig"
        );
        return config;
    },
    framework: {
        name: "@storybook/web-components-vite",
        options: {},
    },
};
export default config;
