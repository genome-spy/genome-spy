import { mergeConfigScopes } from "./mergeConfig.js";

/**
 * @param {object} options
 * @param {import("../spec/config.js").GenomeSpyConfig} options.defaultConfig
 * @param {import("../spec/config.js").GenomeSpyConfig} [options.builtInTheme]
 * @param {import("../spec/config.js").GenomeSpyConfig} [options.theme]
 * @returns {import("../spec/config.js").GenomeSpyConfig}
 */
export function resolveBaseConfig({ defaultConfig, builtInTheme, theme }) {
    return /** @type {import("../spec/config.js").GenomeSpyConfig} */ (
        mergeConfigScopes([defaultConfig, builtInTheme, theme])
    );
}

/**
 * Resolves the effective config for a view scope.
 *
 * @param {import("../spec/config.js").GenomeSpyConfig} baseConfig
 * @param {import("../spec/config.js").GenomeSpyConfig} [parentConfig]
 * @param {import("../spec/config.js").GenomeSpyConfig} [localConfig]
 * @returns {import("../spec/config.js").GenomeSpyConfig}
 */
export function resolveViewConfig(baseConfig, parentConfig, localConfig) {
    if (!parentConfig && !localConfig) {
        return baseConfig;
    }

    return /** @type {import("../spec/config.js").GenomeSpyConfig} */ (
        mergeConfigScopes([baseConfig, parentConfig, localConfig])
    );
}

/**
 * Merges import-site config with imported root config.
 * Imported config has higher precedence.
 *
 * @param {import("../spec/config.js").GenomeSpyConfig} [importConfig]
 * @param {import("../spec/config.js").GenomeSpyConfig} [importedConfig]
 * @returns {import("../spec/config.js").GenomeSpyConfig | undefined}
 */
export function resolveImportedSpecConfig(importConfig, importedConfig) {
    if (!importConfig && !importedConfig) {
        return undefined;
    }

    return /** @type {import("../spec/config.js").GenomeSpyConfig} */ (
        mergeConfigScopes([importConfig, importedConfig])
    );
}
