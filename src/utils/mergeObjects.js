/**
 * 
 * @param  {object[]} objects 
 * @param {string} propertyOf 
 * @param {string[]} [skip]
 */
export default function mergeObjects(objects, propertyOf, skip) {

    skip = skip || [];

    /** @type {object} */
    const target = {};

    /** @param {object} obj */
    const merger = obj => {
        for (let prop in obj) {
            if (!skip.includes(prop) && obj[prop] !== undefined) {
                if (target[prop] !== undefined) {
                    console.warn(`Conflicting property ${prop} of ${propertyOf}: (${JSON.stringify(target[prop])} and ${JSON.stringify(obj[prop])}). Using ${JSON.stringify(target[prop])}.`);
                } else {
                    target[prop] = obj[prop];
                }
            }
        }
    };

    for (const o of objects) {
        merger(o);
    }

    return target;
}