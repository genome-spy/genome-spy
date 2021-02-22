export interface Char {
    id: number;
    width: number;
    height: number;
    xoffset: number;
    yoffset: number;
    xadvance: number;
    chnl: number;
    x: number;
    y: number;
    page: number;
}

export interface Info {
    face: string;
    size: number;
    bold: number;
    italic: number;
    charset: string[];
    unicode: number;
    stretchH: number;
    smooth: number;
    aa: number;
    padding: number[];
    spacing: number[];
}

export interface Common {
    lineHeight: number;
    base: number;
    scaleW: number;
    scaleH: number;
    pages: number;
    packed: number;
    alphaChnl: number;
    redChnl: number;
    greenChnl: number;
    blueChnl: number;
}

export interface Kerning {
    first: number;
    second: number;
    amount: number;
}

/**
 * BMFont as JSON.
 *
 * See: https://github.com/mattdesl/bmfont2json
 */
export interface BMFont {
    pages: string[];
    chars: Char[];
    info: Info;
    common: Common;
    kernings: Kerning[];
}
