/**
 * @typedef {object} Char
 * @prop {number} id
 * @prop {number} width
 * @prop {number} height
 * @prop {number} xoffset
 * @prop {number} yoffset
 * @prop {number} xadvance
 * @prop {number} chnl
 * @prop {number} x
 * @prop {number} y
 * @prop {number} page
 */

/**
 * @typedef {object} Info
 * @prop {string} face
 * @prop {number} size
 * @prop {number} bold
 * @prop {number} italic
 * @prop {string[]} charset
 * @prop {number} unicode
 * @prop {number} stretchH
 * @prop {number} smooth
 * @prop {number} aa
 * @prop {number[]} padding
 * @prop {number[]} spacing
 */

/**
 * @typedef {object} Common
 * @prop {number} lineHeight
 * @prop {number} base
 * @prop {number} scaleW
 * @prop {number} scaleH
 * @prop {number} pages
 * @prop {number} packed
 * @prop {number} alphaChnl
 * @prop {number} redChnl
 * @prop {number} greenChnl
 * @prop {number} blueChnl
 *
 */

/**
 * @typedef {object} FontMetadata
 * @prop {string[]} pages
 * @prop {Char[]} chars
 * @prop {Info} info
 * @prop {Common} common
 * @prop {object[]} kernings
 */

export default {};
