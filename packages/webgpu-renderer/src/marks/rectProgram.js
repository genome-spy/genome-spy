import BaseProgram from "./baseProgram.js";

/**
 * @typedef {import("../index.d.ts").ChannelConfigInput} ChannelConfigInput
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
    "cornerRadius",
    "minWidth",
    "minHeight",
    "minOpacity",
    "shadowOffsetX",
    "shadowOffsetY",
    "shadowBlur",
    "shadowOpacity",
    "shadowColor",
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
    cornerRadius: 0.0,
    minWidth: 0.0,
    minHeight: 0.0,
    minOpacity: 0.0,
    shadowOffsetX: 0.0,
    shadowOffsetY: 0.0,
    shadowBlur: 0.0,
    shadowOpacity: 0.0,
    shadowColor: [0.0, 0.0, 0.0, 1.0],
};

// Default channel behavior for the rect mark. Channels can be overridden
// per instance, but these defaults keep the shader predictable.
/** @type {Record<string, ChannelConfigInput>} */
const DEFAULT_CHANNEL_CONFIGS = {
    x: {
        type: "f32",
        components: 1,
        scale: { type: "linear" },
    },
    x2: {
        type: "f32",
        components: 1,
        scale: { type: "linear" },
    },
    y: {
        type: "f32",
        components: 1,
        scale: { type: "linear" },
    },
    y2: {
        type: "f32",
        components: 1,
        scale: { type: "linear" },
    },
    fill: { components: 4, value: DEFAULTS.fill },
    stroke: { components: 4, value: DEFAULTS.stroke },
    fillOpacity: {
        components: 1,
        value: DEFAULTS.fillOpacity,
    },
    strokeOpacity: {
        components: 1,
        value: DEFAULTS.strokeOpacity,
    },
    strokeWidth: {
        components: 1,
        value: DEFAULTS.strokeWidth,
    },
    cornerRadius: {
        components: 1,
        value: DEFAULTS.cornerRadius,
    },
    minWidth: {
        components: 1,
        value: DEFAULTS.minWidth,
    },
    minHeight: {
        components: 1,
        value: DEFAULTS.minHeight,
    },
    minOpacity: {
        components: 1,
        value: DEFAULTS.minOpacity,
    },
    shadowOffsetX: {
        components: 1,
        value: DEFAULTS.shadowOffsetX,
    },
    shadowOffsetY: {
        components: 1,
        value: DEFAULTS.shadowOffsetY,
    },
    shadowBlur: {
        components: 1,
        value: DEFAULTS.shadowBlur,
    },
    shadowOpacity: {
        components: 1,
        value: DEFAULTS.shadowOpacity,
    },
    shadowColor: {
        components: 4,
        value: DEFAULTS.shadowColor,
    },
};

const RECT_SHADER_BODY = /* wgsl */ `
fn clampMinSize(pos: ptr<function, f32>, frac: f32, size: f32, minSize: f32) -> f32 {
  if (minSize > 0.0 && size < minSize) {
    (*pos) = (*pos) + (frac - 0.5) * (minSize - size);
    return size / minSize;
  }
  return 1.0;
}

fn sort(a: ptr<function, f32>, b: ptr<function, f32>) {
  if (*a > *b) {
    let tmp = *b;
    *b = *a;
    *a = tmp;
  }
}

fn sdRoundedBox(p: vec2<f32>, b: vec2<f32>, r: f32) -> f32 {
  let q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, vec2<f32>(0.0))) - r;
}

fn distanceToRatio(d: f32) -> f32 {
  return clamp(d * globals.dpr + 0.5, 0.0, 1.0);
}

fn distanceToColor(d: f32, fill: vec4<f32>, stroke: vec4<f32>, background: vec4<f32>, halfStrokeWidth: f32) -> vec4<f32> {
  if (halfStrokeWidth > 0.0) {
    let sd = abs(d) - halfStrokeWidth;
    return mix(stroke, select(background, fill, d <= 0.0), distanceToRatio(sd));
  }
  return mix(background, fill, distanceToRatio(-d));
}

fn shadowAlpha(d: f32, blur: f32) -> f32 {
  // TODO: Port the full Gaussian shadow from GLSL. This is a simple fallback.
  if (blur <= 0.0) {
    return select(0.0, 1.0, d <= 0.0);
  }
  return clamp(1.0 - smoothstep(0.0, blur, d), 0.0, 1.0);
}

struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) local: vec2<f32>,
  @location(1) size: vec2<f32>,
  @location(2) fill: vec4<f32>,
  @location(3) stroke: vec4<f32>,
  @location(4) fillOpacity: f32,
  @location(5) strokeOpacity: f32,
  @location(6) strokeWidth: f32,
  @location(7) cornerRadius: f32,
  @location(8) shadowOffset: vec2<f32>,
  @location(9) shadowBlur: f32,
  @location(10) shadowOpacity: f32,
  @location(11) shadowColor: vec4<f32>,
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

  var x = getScaled_x(i);
  var x2 = getScaled_x2(i);
  var y = getScaled_y(i);
  var y2 = getScaled_y2(i);
  sort(&x, &x2);
  sort(&y, &y2);
  let w = x2 - x;
  let h = y2 - y;

  let local = quad[v];
  var px = x + local.x * w;
  var py = y + local.y * h;

  let minW = getScaled_minWidth(i);
  let minH = getScaled_minHeight(i);
  let minOpacity = getScaled_minOpacity(i);
  var opaFactor = max(minOpacity, min(
    clampMinSize(&px, local.x, w, minW),
    clampMinSize(&py, local.y, h, minH)
  ));

  let clip = vec2<f32>(
    (px / globals.width) * 2.0 - 1.0,
    1.0 - (py / globals.height) * 2.0
  );

  var out: VSOut;
  out.pos = vec4<f32>(clip, 0.0, 1.0);
  out.local = local;
  out.size = vec2<f32>(w, h);
  out.fill = getScaled_fill(i);
  out.stroke = getScaled_stroke(i);
  out.fillOpacity = getScaled_fillOpacity(i) * opaFactor;
  out.strokeOpacity = getScaled_strokeOpacity(i) * opaFactor;
  out.strokeWidth = getScaled_strokeWidth(i);
  out.cornerRadius = getScaled_cornerRadius(i);
  out.shadowOffset = vec2<f32>(getScaled_shadowOffsetX(i), getScaled_shadowOffsetY(i));
  out.shadowBlur = getScaled_shadowBlur(i);
  out.shadowOpacity = getScaled_shadowOpacity(i);
  out.shadowColor = getScaled_shadowColor(i);
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let halfSize = in.size * 0.5;
  let centered = (in.local - vec2<f32>(0.5)) * in.size;

  let d = sdRoundedBox(centered, halfSize, in.cornerRadius);

  var fillColor = in.fill;
  fillColor.a = fillColor.a * in.fillOpacity;

  var strokeColor = in.stroke;
  strokeColor.a = strokeColor.a * in.strokeOpacity;

  var background = vec4<f32>(0.0, 0.0, 0.0, 0.0);
  if (in.shadowOpacity > 0.0) {
    let sd = sdRoundedBox(centered - in.shadowOffset, halfSize, in.cornerRadius);
    let alpha = shadowAlpha(sd, in.shadowBlur) * in.shadowOpacity;
    background = vec4<f32>(in.shadowColor.rgb, alpha);
  }

  return distanceToColor(d, fillColor, strokeColor, background, in.strokeWidth * 0.5);
}
`;

export default class RectProgram extends BaseProgram {
    /**
     * @returns {string[]}
     */
    get channelOrder() {
        return CHANNELS;
    }

    /**
     * @returns {string[]}
     */
    get optionalChannels() {
        return ["uniqueId"];
    }

    /**
     * @returns {Record<string, ChannelConfigInput>}
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

    /**
     * @param {string} name
     * @returns {[number, number] | undefined}
     */
    getDefaultScaleRange(name) {
        if (!this.renderer?._globals) {
            return undefined;
        }
        if (name === "x" || name === "x2") {
            return [0, this.renderer._globals.width];
        }
        if (name === "y" || name === "y2") {
            return [0, this.renderer._globals.height];
        }
        return undefined;
    }
}
