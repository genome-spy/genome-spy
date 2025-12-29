import MarkBase from "./markBase.js";

/**
 * @typedef {import("../renderer.js").TypedArray} TypedArray
 *
 * @typedef {object} ChannelScale
 * @prop {"identity"|"linear"} type
 * @prop {[number, number]} [domain]
 * @prop {[number, number]} [range]
 *
 * @typedef {object} ChannelConfig
 * @prop {"buffer"|"uniform"} [source]
 * @prop {TypedArray} [data]
 * @prop {"f32"|"u32"|"i32"} [type]
 * @prop {1|2|4} [components]
 * @prop {ChannelScale} [scale]
 * @prop {number|number[]} [value]
 * @prop {number|number[]} [default]
 */

/** @type {string[]} */
const CHANNELS = [
    "uniqueId",
    "x",
    "x2",
    "y",
    "y2",
    "fill",
    "stroke",
    "fillOpacity",
    "strokeOpacity",
    "strokeWidth",
];

/** @type {Record<string, number|number[]>} */
const DEFAULTS = {
    x: 0,
    x2: 10,
    y: 0,
    y2: 10,
    fill: [0.27, 0.49, 0.8, 1.0],
    stroke: [0.0, 0.0, 0.0, 1.0],
    fillOpacity: 1.0,
    strokeOpacity: 1.0,
    strokeWidth: 1.0,
};

// Default channel behavior for the rect mark. Channels can be overridden
// per instance, but these defaults keep the shader predictable.
/** @type {Record<string, ChannelConfig>} */
const DEFAULT_CHANNEL_CONFIGS = {
    x: {
        source: "buffer",
        type: "f32",
        components: 1,
        scale: { type: "identity" },
    },
    x2: {
        source: "buffer",
        type: "f32",
        components: 1,
        scale: { type: "identity" },
    },
    y: {
        source: "buffer",
        type: "f32",
        components: 1,
        scale: { type: "identity" },
    },
    y2: {
        source: "buffer",
        type: "f32",
        components: 1,
        scale: { type: "identity" },
    },
    fill: { source: "uniform", components: 4, value: DEFAULTS.fill },
    stroke: { source: "uniform", components: 4, value: DEFAULTS.stroke },
    fillOpacity: {
        source: "uniform",
        components: 1,
        value: DEFAULTS.fillOpacity,
    },
    strokeOpacity: {
        source: "uniform",
        components: 1,
        value: DEFAULTS.strokeOpacity,
    },
    strokeWidth: {
        source: "uniform",
        components: 1,
        value: DEFAULTS.strokeWidth,
    },
};

const RECT_SHADER_BODY = /* wgsl */ `
struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) local: vec2<f32>,
  @location(1) size: vec2<f32>,
  @location(2) fill: vec4<f32>,
  @location(3) stroke: vec4<f32>,
  @location(4) fillOpacity: f32,
  @location(5) strokeOpacity: f32,
  @location(6) strokeWidth: f32,
};

@vertex
fn vs_main(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> VSOut {
  var quad = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 0.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(1.0, 1.0)
  );

  let x = value_x(i);
  let x2 = value_x2(i);
  let y = value_y(i);
  let y2 = value_y2(i);
  let w = x2 - x;
  let h = y2 - y;

  let local = quad[v];
  let pos = vec2<f32>(x + local.x * w, y + local.y * h);

  let clip = vec2<f32>(
    (pos.x / globals.width) * 2.0 - 1.0,
    1.0 - (pos.y / globals.height) * 2.0
  );

  var out: VSOut;
  out.pos = vec4<f32>(clip, 0.0, 1.0);
  out.local = local;
  out.size = vec2<f32>(w, h);
  out.fill = value_fill(i);
  out.stroke = value_stroke(i);
  out.fillOpacity = value_fillOpacity(i);
  out.strokeOpacity = value_strokeOpacity(i);
  out.strokeWidth = value_strokeWidth(i);
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let edgeX = min(in.local.x, 1.0 - in.local.x) * in.size.x;
  let edgeY = min(in.local.y, 1.0 - in.local.y) * in.size.y;
  let edge = min(edgeX, edgeY);

  var fillColor = in.fill;
  fillColor.a = fillColor.a * in.fillOpacity;

  var strokeColor = in.stroke;
  strokeColor.a = strokeColor.a * in.strokeOpacity;

  if (in.strokeWidth > 0.0 && edge < in.strokeWidth) {
    return strokeColor;
  }

  return fillColor;
}
`;

export default class RectMark extends MarkBase {
    /**
     * @returns {string[]}
     */
    get channelOrder() {
        return CHANNELS;
    }

    /**
     * @returns {Record<string, ChannelConfig>}
     */
    get defaultChannelConfigs() {
        return DEFAULT_CHANNEL_CONFIGS;
    }

    /**
     * @returns {Record<string, number|number[]>}
     */
    get defaultValues() {
        return DEFAULTS;
    }

    /**
     * @returns {string}
     */
    get shaderBody() {
        return RECT_SHADER_BODY;
    }
}
