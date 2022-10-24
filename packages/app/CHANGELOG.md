# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [0.26.0](https://github.com/genome-spy/genome-spy/compare/v0.25.1...v0.26.0) (2022-10-24)


### Features

* **app:** add histogram to advanced filtering and grouping ([#134](https://github.com/genome-spy/genome-spy/issues/134)) ([fb9ae38](https://github.com/genome-spy/genome-spy/commit/fb9ae38e38e9c6c11439f3f946ad745e88ab7389))





## [0.25.1](https://github.com/genome-spy/genome-spy/compare/v0.25.0...v0.25.1) (2022-10-13)

**Note:** Version bump only for package @genome-spy/app





# [0.25.0](https://github.com/genome-spy/genome-spy/compare/v0.24.2...v0.25.0) (2022-10-12)


### Features

* **app:** activate closeup (peeking) from context menu ([9591960](https://github.com/genome-spy/genome-spy/commit/9591960302643e1505bd804f2a75e8433d47c14b)), closes [#129](https://github.com/genome-spy/genome-spy/issues/129)
* **app:** round the left corners of group labels ([3efbc51](https://github.com/genome-spy/genome-spy/commit/3efbc518e90c4f55f33a504266f9667a1db3a7db))





## [0.24.2](https://github.com/genome-spy/genome-spy/compare/v0.24.1...v0.24.2) (2022-10-04)

**Note:** Version bump only for package @genome-spy/app





## [0.24.1](https://github.com/genome-spy/genome-spy/compare/v0.24.0...v0.24.1) (2022-09-07)

**Note:** Version bump only for package @genome-spy/app





# [0.24.0](https://github.com/genome-spy/genome-spy/compare/v0.23.0...v0.24.0) (2022-09-07)


### Bug Fixes

* **app:** order ordinal groups correctly ([344b761](https://github.com/genome-spy/genome-spy/commit/344b7616bcfb2822de831344e0a428accd74c8f2)), closes [#114](https://github.com/genome-spy/genome-spy/issues/114)


### Features

* **app:** add "Retain first n categories of xxx" action ([4debaf7](https://github.com/genome-spy/genome-spy/commit/4debaf719b2fbc41fa74dbdb215645041fb2c477)), closes [#108](https://github.com/genome-spy/genome-spy/issues/108)
* **app:** add "retain group-wise matched samples" action ([1d1aeb4](https://github.com/genome-spy/genome-spy/commit/1d1aeb4b5dd12ac4ddc37f1c17499b116bb87b50)), closes [#113](https://github.com/genome-spy/genome-spy/issues/113)





# [0.23.0](https://github.com/genome-spy/genome-spy/compare/v0.22.1...v0.23.0) (2022-08-09)


### Bug Fixes

* **app:** improve link color in dialogs ([31d3aa8](https://github.com/genome-spy/genome-spy/commit/31d3aa8f941f3ea1a7914723facae1df160b2629))


### Features

* **app:** reset the state when bookmark tour ends ([8c1f00b](https://github.com/genome-spy/genome-spy/commit/8c1f00bafd34565cbc9af8b7120e0d9d3357b027))





## [0.22.1](https://github.com/genome-spy/genome-spy/compare/v0.22.0...v0.22.1) (2022-06-01)

**Note:** Version bump only for package @genome-spy/app





# [0.22.0](https://github.com/genome-spy/genome-spy/compare/v0.21.0...v0.22.0) (2022-05-31)


### Bug Fixes

* **app:** keyboard shortcuts during a bookmark tour ([33bcfaa](https://github.com/genome-spy/genome-spy/commit/33bcfaa2bcda7e14bdf2327f4cbcd3ff5347a9e1))
* **app:** prevent warning when pressing esc in a dialog ([7b835ae](https://github.com/genome-spy/genome-spy/commit/7b835aee6118dc4c3f57d5c6be154e0f1c12c955))


### Features

* **app:** short urls to server-side bookmarks ([110a237](https://github.com/genome-spy/genome-spy/commit/110a2376d76527ad4d2d02d76a9b6fc8343fb822))
* **app:** use a unique view name to identify an attribute (really!) ([185c110](https://github.com/genome-spy/genome-spy/commit/185c110c04887516c5d2a7da7b00f2c6be4f3414))





# [0.21.0](https://github.com/genome-spy/genome-spy/compare/v0.20.0...v0.21.0) (2022-05-24)


### Features

* use a unique view name to identify an attribute ([6721b9e](https://github.com/genome-spy/genome-spy/commit/6721b9e8113974abb42491a390469f00d480e33e))





# [0.20.0](https://github.com/genome-spy/genome-spy/compare/v0.19.1...v0.20.0) (2022-05-11)


### Bug Fixes

* **app:** adjust attributes' offset to make rects crispier ([e2e178d](https://github.com/genome-spy/genome-spy/commit/e2e178dca2f11f4969becc1b58396e43f2eb36c6))
* **app:** context menu didn't appear ([dadd57c](https://github.com/genome-spy/genome-spy/commit/dadd57c4f4059fe53ba51e69d3a9f447a104baa5))
* **app:** padding issue ([847bb8d](https://github.com/genome-spy/genome-spy/commit/847bb8def3a4b0800774571ee19946307a1554b1)), closes [#97](https://github.com/genome-spy/genome-spy/issues/97)


### Features

* **core:** view titles ([#101](https://github.com/genome-spy/genome-spy/issues/101)) ([b14bd85](https://github.com/genome-spy/genome-spy/commit/b14bd85aa487619cf3b42f1e364a803ef65a8921))





## [0.19.1](https://github.com/genome-spy/genome-spy/compare/v0.19.0...v0.19.1) (2022-04-11)

**Note:** Version bump only for package @genome-spy/app





# [0.19.0](https://github.com/genome-spy/genome-spy/compare/v0.18.1...v0.19.0) (2022-03-28)


### Features

* **app:** accept single chromosomes and single-base coords in the search field. Closes [#85](https://github.com/genome-spy/genome-spy/issues/85) ([eef5a44](https://github.com/genome-spy/genome-spy/commit/eef5a44334804bc5991dd5b74e4e22376a1915a2))
* **app:** advanced filter with "value at locus" ([eebb0e0](https://github.com/genome-spy/genome-spy/commit/eebb0e0953eedde22e3827ab76a42bab42fc0fb5))
* **app:** allow transforms in `aggregateSamples` ([8aed769](https://github.com/genome-spy/genome-spy/commit/8aed76923c840e69fc0798cdeb9acc56e983eef6))
* **app:** group samples by threshold on attribute ([dd9e5cf](https://github.com/genome-spy/genome-spy/commit/dd9e5cf5394d9733c50741369f226dec348be591))





## [0.18.1](https://github.com/genome-spy/genome-spy/compare/v0.18.0...v0.18.1) (2022-02-10)

**Note:** Version bump only for package @genome-spy/app





# [0.18.0](https://github.com/genome-spy/genome-spy/compare/v0.17.1...v0.18.0) (2022-02-10)


### Bug Fixes

* **app:** hide fullscreen button on unsupported browsers ([e2f2c2a](https://github.com/genome-spy/genome-spy/commit/e2f2c2a0ed81b3b9d5eb9df77b78b0b82b15b2d6))
* **app:** make font and icon sizes consistent across browsers ([fb1f3d1](https://github.com/genome-spy/genome-spy/commit/fb1f3d1ec23b290ce8a00d394e0aeb9583f954f4))
* **app:** make spacing of buttons consistent in modal dialogs ([b780c0a](https://github.com/genome-spy/genome-spy/commit/b780c0ae7a991f46506399d7c53e9f6af6722682))
* **app:** relative URLs in bookmark notes now use spec's path as baseUrl ([4ccb433](https://github.com/genome-spy/genome-spy/commit/4ccb433d3663d189fa2bc29a1b7ee28e63925597))


### Features

* **playground:** validate spec using JSON schema ([#87](https://github.com/genome-spy/genome-spy/issues/87)) ([d6fc84c](https://github.com/genome-spy/genome-spy/commit/d6fc84c7c090931c96b8e571701249090a03f49e))





## [0.17.1](https://github.com/tuner/genome-spy/compare/v0.17.0...v0.17.1) (2022-01-21)


### Bug Fixes

* **app:** bad usability of "Share bookmark" dialog ([325994c](https://github.com/tuner/genome-spy/commit/325994c05ade17f479b677403078d748ff8a1a12))





# [0.17.0](https://github.com/tuner/genome-spy/compare/v0.16.0...v0.17.0) (2022-01-21)


### Bug Fixes

* **app:** don't suppress tooltips when using a "tour" modal ([7533e27](https://github.com/tuner/genome-spy/commit/7533e27a1b71baaaace21263057552020fa6ced4))
* **app:** open links in markdown in new tab ([46c0f83](https://github.com/tuner/genome-spy/commit/46c0f833fc785bd8aebbf7ea9f40cef7e0e77403))


### Features

* **app:** multilevel context menu ([#70](https://github.com/tuner/genome-spy/issues/70)) ([b2212ac](https://github.com/tuner/genome-spy/commit/b2212ac450fa751387aaad37532f9ec3f3564be4))
* **app:** remote bookmarks and bookmark tour ([#71](https://github.com/tuner/genome-spy/issues/71)) ([54211aa](https://github.com/tuner/genome-spy/commit/54211aa09aecf0dda1205b20df1d00cc87c8254f))





# [0.16.0](https://github.com/tuner/genome-spy/compare/v0.15.0...v0.16.0) (2021-12-20)

**Note:** Version bump only for package @genome-spy/app





# [0.15.0](https://github.com/tuner/genome-spy/compare/v0.14.2...v0.15.0) (2021-11-25)

**Note:** Version bump only for package @genome-spy/app





## [0.14.2](https://github.com/tuner/genome-spy/compare/v0.14.1...v0.14.2) (2021-11-24)

**Note:** Version bump only for package @genome-spy/app





## [0.14.1](https://github.com/tuner/genome-spy/compare/v0.14.0...v0.14.1) (2021-11-23)

**Note:** Version bump only for package @genome-spy/app





# [0.14.0](https://github.com/tuner/genome-spy/compare/v0.13.0...v0.14.0) (2021-11-23)


### Features

* split GenomeSpy "core" and "app" into separate, scoped npm packages ([#62](https://github.com/tuner/genome-spy/issues/62)) ([f3efe78](https://github.com/tuner/genome-spy/commit/f3efe783961a416d8b12b96d563a963b87829dfa))
