
/**
 * @typedef {import("../../spec/transform").RegexExtractConfig} RegexExtractConfig
 */

// TODO: Implement asType (string, integer, float, boolean)

/**
 * 
 * @param {RegexExtractConfig} config 
 * @param {*} rows 
 */
export default function regexMatchTransform(config, rows) {
    const re = new RegExp(config.regex);

    const as = typeof config.as == "string" ? [config.as] : config.as;

    return rows.map(row => {
        const newRow = { ...row };

        const value = row[config.field];
        if (typeof value === "string") {
            const m = value.match(re);

            if (m) {
                if (m.length - 1 != as.length) {
                    throw new Error('The number of RegEx groups and the length of "as" do not match!');
                }

                as.forEach((group, i) => {
                    newRow[group] = m[i + 1];
                });

            } else if (!config.skipInvalidInput) {
                throw new Error(`"${value}" does not match the given regex: ${re.toString()}`);
            }

        } else if (!config.skipInvalidInput) {
            throw new Error(`Trying to match a non-string field. Encountered type: ${typeof value}`);
        }

        return newRow;
    });
}