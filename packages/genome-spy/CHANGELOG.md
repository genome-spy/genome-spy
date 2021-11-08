# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [0.11.0](https://github.com/tuner/genome-spy/compare/v0.10.0...v0.11.0) (2021-11-08)


### Features

* bookmark sharing ([723de00](https://github.com/tuner/genome-spy/commit/723de00477ae4169f32ac8157ed4d602f29b414d))





# [0.10.0](https://github.com/tuner/genome-spy/compare/v0.9.0...v0.10.0) (2021-11-02)


### Bug Fixes

* adjust line-height of operator symbols in context menus etc ([791cdfe](https://github.com/tuner/genome-spy/commit/791cdfe61bae5a2bdd1f9816df708c4067babb74))
* don't complain about missing renderingContext (if it's not yet available) ([d8715f6](https://github.com/tuner/genome-spy/commit/d8715f6ed63947b7ff560b8f64aa671b3e1cf2d0))
* filter Redux' internal actions from provenance dropdown ([f10b2a3](https://github.com/tuner/genome-spy/commit/f10b2a30257592e73502f3321d640a8d5165e4d6))
* filter Redux' internal actions from undo history ([6bb31ea](https://github.com/tuner/genome-spy/commit/6bb31ea5a9e6803ccf9d804a6275baf0adc754ea))
* uncaught error in attribute highlighting ([56a2190](https://github.com/tuner/genome-spy/commit/56a21900504a880d29973b56dcfc27952df85565))
* uncaught error in listener that closes search dropdown ([c944589](https://github.com/tuner/genome-spy/commit/c944589bcfc7d65803ed3cd7dd60540eb3c4da3c))
* update state when the url hash is changed ([fc62ad2](https://github.com/tuner/genome-spy/commit/fc62ad2bfb674ee3b06300435c283860af97a74f))
* use less/greater than unicode symbols in context menus ([fb3c892](https://github.com/tuner/genome-spy/commit/fb3c89265d2b98c3744251b6f5aed1674aec2812))
* various errors when SampleSlice is not present ([193b941](https://github.com/tuner/genome-spy/commit/193b941b6f7028958bf5d755b6a5ad148f2729d2))


### Features

* add crc32 checksum to the state hash in url ([f6c4284](https://github.com/tuner/genome-spy/commit/f6c4284cc595d73e0e58b06822fdc2cb75d94538))
* filtering/sorting by sample id ([f364400](https://github.com/tuner/genome-spy/commit/f36440030fb7afd44a6b2c5b793b6de00dc05480))





# [0.9.0](https://github.com/tuner/genome-spy/compare/v0.8.0...v0.9.0) (2021-10-21)


### Features

* improved bookmarking ([#46](https://github.com/tuner/genome-spy/issues/46)) ([0f2c8ec](https://github.com/tuner/genome-spy/commit/0f2c8ece6927e7ca50dd2c224adc7b97cd27bb55))





# [0.8.0](https://github.com/tuner/genome-spy/compare/v0.7.0...v0.8.0) (2021-10-20)


### Bug Fixes

* endpoint rounding in conversion from continuous to chromosomal intervals ([1576328](https://github.com/tuner/genome-spy/commit/15763285604cb3db07367cfa4f98ab6dec2c7c66))
* return a proper "complex" domain when it comprises the whole genome ([20b832f](https://github.com/tuner/genome-spy/commit/20b832ff607d5e8afae297b890c7945bd7c61e4e))


### Features

* store all (named) scale domains in bookmarks ([ded9141](https://github.com/tuner/genome-spy/commit/ded9141c9c50fadab154c7e383ebd696851c52e6))
* update zoomed scale domains to url hash ([96da343](https://github.com/tuner/genome-spy/commit/96da3437773a19aab09ebff722cc10e16c30f3d4))





# [0.7.0](https://github.com/tuner/genome-spy/compare/v0.6.0...v0.7.0) (2021-10-14)


### Bug Fixes

* group label positions when window is resized ([ca72dd0](https://github.com/tuner/genome-spy/commit/ca72dd0c6bb61232467f36be203bda57095b7c45))
* provide an event object for clicks that didn't hit a mark ([19022f1](https://github.com/tuner/genome-spy/commit/19022f1379b8e42d97b4e6051f04c6726b40778f))


### Features

* add removeEventListener to the api ([04f29e3](https://github.com/tuner/genome-spy/commit/04f29e3242b0a4ef80a3e50696141d888d78c75a))
* add sagittaScaleFactor prop to link mark ([758585f](https://github.com/tuner/genome-spy/commit/758585f474c93fef81abfef687a32ea677b80a37))
* named and observable scales ([#45](https://github.com/tuner/genome-spy/issues/45)) ([4011548](https://github.com/tuner/genome-spy/commit/4011548ff43c9562d434328172cdb335909e43a2))





# [0.6.0](https://github.com/tuner/genome-spy/compare/v0.5.3...v0.6.0) (2021-09-28)


### Bug Fixes

* implicit provenance undo when the current node is not the last one ([0146fab](https://github.com/tuner/genome-spy/commit/0146fab72459def5b4c99682a35c95746ee44f88))
* improve search field's focus/selection behavior ([fd68e5d](https://github.com/tuner/genome-spy/commit/fd68e5dffa13139ad614e595a585c299fc34b165))


### Features

* implicit provenance undo when using the search field to filter samples by nominal attributes ([4c195c6](https://github.com/tuner/genome-spy/commit/4c195c6264fe84da15aa47d763471135cae37d54))





## [0.5.3](https://github.com/tuner/genome-spy/compare/v0.5.2...v0.5.3) (2021-09-26)


### Bug Fixes

* hide secondary channels in axis titles when primary has an explicit title ([7d30100](https://github.com/tuner/genome-spy/commit/7d30100c2aa711facf69737156469a300b1c846d))
* padding property of index and locus scales ([b854ad7](https://github.com/tuner/genome-spy/commit/b854ad7c7f127e0c3eb65c7e7e440fd1eff1feae))
* rule mark with undefined x/y encoding ([a6bd807](https://github.com/tuner/genome-spy/commit/a6bd8070825116983c62ade259e2cb1a9088a822))





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

### Features

- "excluded" scale/axis resolution ([f98d5d9](https://github.com/tuner/genome-spy/commit/f98d5d9cb0aa79ecd934e80f0f5756c3d36afc80))
- configurable default scale/axis resolution ([fde95ce](https://github.com/tuner/genome-spy/commit/fde95cee27158bd2cb8cc39b56582f3eb1574e95))
- custom tooltip handlers ([#38](https://github.com/tuner/genome-spy/issues/38)) ([2690eeb](https://github.com/tuner/genome-spy/commit/2690eeb4d62ad3842e7ef131a40747e89cf1e667))
- group labels in sample view ([#37](https://github.com/tuner/genome-spy/issues/37)) ([c57eecb](https://github.com/tuner/genome-spy/commit/c57eecb137f5943a2c7f1538afd51afb24e94ed7))
- step-based sizes ([8a2e91d](https://github.com/tuner/genome-spy/commit/8a2e91d0acb091442e6efd42aa44e51bf00856a8))
- zoom extent and genomic coordinate domains ([#30](https://github.com/tuner/genome-spy/issues/30)) ([28d61c4](https://github.com/tuner/genome-spy/commit/28d61c4794009a17c631e1d4ff9007b6b2740d26))

### Performance Improvements

- optimize range texture updating ([f16a717](https://github.com/tuner/genome-spy/commit/f16a717b9fbb81e04c59b80898634f2033220576))
