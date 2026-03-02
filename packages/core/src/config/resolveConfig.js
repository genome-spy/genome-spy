import { mergeConfigScopes } from "./mergeConfig.js";
import { resolveThemeSelection } from "./themes.js";

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
 * Resolves a local config scope by applying selected built-in theme(s) first
 * and explicit config properties second.
 *
 * @param {import("../spec/config.js").BuiltInThemeName | import("../spec/config.js").BuiltInThemeName[] | undefined} themeSelection
 * @param {import("../spec/config.js").GenomeSpyConfig} [localConfig]
 * @returns {import("../spec/config.js").GenomeSpyConfig | undefined}
 */
export function resolveLocalConfigScope(themeSelection, localConfig) {
    const themed = resolveThemeSelection(themeSelection);
    if (!themed && !localConfig) {
        return undefined;
    }
    return /** @type {import("../spec/config.js").GenomeSpyConfig} */ (
        mergeConfigScopes([themed, localConfig])
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
