# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.5.2](https://github.com/tuner/genome-spy/compare/v0.5.1...v0.5.2) (2021-09-20)


### Bug Fixes

* colors in tooltip ([1bf1a0e](https://github.com/tuner/genome-spy/commit/1bf1a0ea3fb4b415e454c681d42b59ac00e25fbf))





## [0.5.1](https://github.com/tuner/genome-spy/compare/v0.5.0...v0.5.1) (2021-09-18)


### Bug Fixes

* sampleAttributePanel hovering ([3567cdf](https://github.com/tuner/genome-spy/commit/3567cdf8788214006b9cf5cb44e499744d9d02b3))





# [0.5.0](https://github.com/tuner/genome-spy/compare/v0.4.0...v0.5.0) (2021-09-17)


### Bug Fixes

* baseUrl handling when importing views ([609d432](https://github.com/tuner/genome-spy/commit/609d43246cc475cf727e7c61ff9f42f41ce62e3e))
* handle scale resolution of color/stroke/fill correcly ([6cbd685](https://github.com/tuner/genome-spy/commit/6cbd685b25f756322d43ec0e927f052782eb91d6))
* point mark's angle direction ([c3b6d5b](https://github.com/tuner/genome-spy/commit/c3b6d5b58abe97bc26445584c4f606136d6a4606))
* text mark's squeeze property ([a8cb939](https://github.com/tuner/genome-spy/commit/a8cb9393a16da586ac85d09aafc9d8bd8385d102))


### Features

* add offset prop to linearizeGenomicCoord ([cc7d070](https://github.com/tuner/genome-spy/commit/cc7d0701670e4458bb8fb75f533c2a048d28eb45))
* promote text mark's angle prop to channel ([5e4c8e4](https://github.com/tuner/genome-spy/commit/5e4c8e44e1734fcd82f73d3e5462cfa0d79a1010))
* properly stroked point marks + angle channel ([#44](https://github.com/tuner/genome-spy/issues/44)) ([81ef701](https://github.com/tuner/genome-spy/commit/81ef701dc35b37b611626bf3f3e89220016bbb26))
* stroked and rounded rects ([#42](https://github.com/tuner/genome-spy/issues/42)) ([a517f70](https://github.com/tuner/genome-spy/commit/a517f7009dc9c3c26b665c65736b6682df592f07))
* view backgrounds ([#43](https://github.com/tuner/genome-spy/issues/43)) ([810caf2](https://github.com/tuner/genome-spy/commit/810caf25db8214ec482ad2ac65360b375cc2b397))





# [0.4.0](https://github.com/tuner/genome-spy/compare/v0.3.0...v0.4.0) (2021-08-26)


### Bug Fixes

* import topk -> topK. Compilation failed on linux ([f35fe0e](https://github.com/tuner/genome-spy/commit/f35fe0ed199d5ce3b4c09c340fc7f04c9c8e12aa))
* improve sample attribute highlight behavior ([76479ce](https://github.com/tuner/genome-spy/commit/76479ce5c92da93c2794fb223dd485d2f458bf25))


### Features

* abortable transition ([ddd39ee](https://github.com/tuner/genome-spy/commit/ddd39eeb240737cd5611bdefaeaf052ecb72f6ca))
* highlight sample attribute column upon hover ([ceb5d61](https://github.com/tuner/genome-spy/commit/ceb5d61be3f0f173c80b0a96c5ac626207ebc73e))
* transition delay ([9f4a535](https://github.com/tuner/genome-spy/commit/9f4a535356a0cf82a255b92a3b0a89affe4a8266))





# [0.3.0](https://github.com/tuner/genome-spy/compare/v0.2.0...v0.3.0) (2021-08-20)

### Features

- accept strings and HTMLElements from tooltip handlers ([f5eef50](https://github.com/tuner/genome-spy/commit/f5eef5020bee8758373d5a2f9247e105f513bcb0))
- export lit's html tag function ([d0d993c](https://github.com/tuner/genome-spy/commit/d0d993c0def00e0077c62071a21c54fb265f2ae0))

# [0.2.0](https://github.com/tuner/genome-spy/compare/v0.1.7...v0.2.0) (2021-08-20)

### Bug Fixes

- make FlexDimensions immutable ([b94a665](https://github.com/tuner/genome-spy/commit/b94a66517fbc9862235e4160192de012c08c1975))
- problem with groupPanel and no initial groups ([9552ed7](https://github.com/tuner/genome-spy/commit/9552ed70db74fbf1a879063e7c3a7268b92053fd))
- reckon outerPadding with step-based sizes ([bfd0210](https://github.com/tuner/genome-spy/commit/bfd0210568942a2b2da4317312b62e0873bb671b))
- squeeze and flush rotated text ([3ce96d5](https://github.com/tuner/genome-spy/commit/3ce96d55ea3dd36562139dbc24bfe4fe964f352b))
- typings of view paddings ([52055e0](https://github.com/tuner/genome-spy/commit/52055e0061c421882ab47ef3d1d986ce08924119))

### Features

- "excluded" scale/axis resolution ([f98d5d9](https://github.com/tuner/genome-spy/commit/f98d5d9cb0aa79ecd934e80f0f5756c3d36afc80))
- configurable default scale/axis resolution ([fde95ce](https://github.com/tuner/genome-spy/commit/fde95cee27158bd2cb8cc39b56582f3eb1574e95))
- custom tooltip handlers ([#38](https://github.com/tuner/genome-spy/issues/38)) ([2690eeb](https://github.com/tuner/genome-spy/commit/2690eeb4d62ad3842e7ef131a40747e89cf1e667))
- group labels in sample view ([#37](https://github.com/tuner/genome-spy/issues/37)) ([c57eecb](https://github.com/tuner/genome-spy/commit/c57eecb137f5943a2c7f1538afd51afb24e94ed7))
- step-based sizes ([8a2e91d](https://github.com/tuner/genome-spy/commit/8a2e91d0acb091442e6efd42aa44e51bf00856a8))
- zoom extent and genomic coordinate domains ([#30](https://github.com/tuner/genome-spy/issues/30)) ([28d61c4](https://github.com/tuner/genome-spy/commit/28d61c4794009a17c631e1d4ff9007b6b2740d26))

### Performance Improvements

- optimize range texture updating ([f16a717](https://github.com/tuner/genome-spy/commit/f16a717b9fbb81e04c59b80898634f2033220576))
