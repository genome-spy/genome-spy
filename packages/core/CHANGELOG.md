# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [0.70.0](https://github.com/genome-spy/genome-spy/compare/v0.69.1...v0.70.0) (2026-02-17)

### Bug Fixes

* **app:** make metadata def merges idempotent ([fc0cc8f](https://github.com/genome-spy/genome-spy/commit/fc0cc8f80bd474c2e33ea348dbb2eca8451bc831)) by @tuner
* **core:** honor reverse for WebGL scheme scales ([0801399](https://github.com/genome-spy/genome-spy/commit/0801399c6f21d7d34f08c109061460f3f7ff4bfa)), closes [#173](https://github.com/genome-spy/genome-spy/issues/173) by @tuner

### Features

* **app:** metadata sources for expression data and others ([#329](https://github.com/genome-spy/genome-spy/issues/329)) ([b650c60](https://github.com/genome-spy/genome-spy/commit/b650c60dc9cda698e0b18fbaf4926e68f54bc4fc)) by @tuner

## [0.69.1](https://github.com/genome-spy/genome-spy/compare/v0.69.0...v0.69.1) (2026-02-12)

### Bug Fixes

* **core:** keep existing visualizations working with unordered dynamic opacity stops ([6bb11fa](https://github.com/genome-spy/genome-spy/commit/6bb11fa6e3c13ada8dd10ee8f0bf6815454687b9)) by @tuner

# [0.69.0](https://github.com/genome-spy/genome-spy/compare/v0.68.0...v0.69.0) (2026-02-12)

### Bug Fixes

* **core:** avoid rewriting synthesized locus secondary channels ([9fdd1be](https://github.com/genome-spy/genome-spy/commit/9fdd1bec1db53624a4dd5c7b9eab54725febd532)) by @tuner
* **core:** initialize lazy sources before binding expr refs ([2485e52](https://github.com/genome-spy/genome-spy/commit/2485e520279918f8e3deeebf9736d6b3a9760eb5)) by @tuner
* **core:** restore canonical schema type names for docs macro ([2d5109c](https://github.com/genome-spy/genome-spy/commit/2d5109c37a0f416181d0dba3156f7cd7da268cc9)) by @tuner

### Features

* **core:** add genome formatLocus helper ([6c35d0e](https://github.com/genome-spy/genome-spy/commit/6c35d0eaad126154b79a8b0522428651cf93cc28)) by @tuner
* **core:** add multiscale semantic zoom composition ([#326](https://github.com/genome-spy/genome-spy/issues/326)) ([8399ce5](https://github.com/genome-spy/genome-spy/commit/8399ce564f38a5f46f97e81f733945b4173ea213)), closes [#258](https://github.com/genome-spy/genome-spy/issues/258) by @tuner
* **core:** add tooltip context scaffolding ([64fd38a](https://github.com/genome-spy/genome-spy/commit/64fd38aaf941f285fb78770bcabb8f8559d8fda9)) by @tuner
* **core:** capitalize and rename tooltip coordinate labels ([d57c747](https://github.com/genome-spy/genome-spy/commit/d57c747d593c282f82f399aeccc992f5a296dd6e)) by @tuner
* **core:** derive genomic tooltip rows from encoders ([774c36e](https://github.com/genome-spy/genome-spy/commit/774c36e60dcdd9a29a332ad553d2bc00cc030839)) by @tuner
* **core:** extend tooltip handler context typing ([f4b559b](https://github.com/genome-spy/genome-spy/commit/f4b559b01665d9ebe7c1adefe64a6b1a60a8e918)) by @tuner
* **core:** preserve endpoint label order using field hints ([840bcb4](https://github.com/genome-spy/genome-spy/commit/840bcb462bf6d5de69285af053d3ad1de4caec84)) by @tuner
* **core:** render genomic tooltip rows before raw fields ([359e90d](https://github.com/genome-spy/genome-spy/commit/359e90d7c6d7f3b3acf93b1432e56d39169e9f4c)) by @tuner
* **core:** support expression-driven semantic zoom stops ([#327](https://github.com/genome-spy/genome-spy/issues/327)) ([ded0b00](https://github.com/genome-spy/genome-spy/commit/ded0b00b9d92be139556057809f96408075b49bf)) by @tuner
* **core:** support visibility override in imports ([0ec8570](https://github.com/genome-spy/genome-spy/commit/0ec85707c69348b63fb928bac726842485f596e5)), closes [#292](https://github.com/genome-spy/genome-spy/issues/292) by @tuner
* **core:** verify genomic source fields before hiding ([a00d200](https://github.com/genome-spy/genome-spy/commit/a00d2003a67b6b8b41386db19c81526230a68999)) by @tuner

### Performance Improvements

* **core:** cache tooltip linearization mappings per mark ([c2fee08](https://github.com/genome-spy/genome-spy/commit/c2fee0872ef4f1b0f22d0b6fdf35d96c427ebaf7)) by @tuner

# [0.68.0](https://github.com/genome-spy/genome-spy/compare/v0.67.0...v0.68.0) (2026-02-09)

### Bug Fixes

* **app:** layout size invalidation ([#316](https://github.com/genome-spy/genome-spy/issues/316)) ([e133f02](https://github.com/genome-spy/genome-spy/commit/e133f02c90503a4bb678bbd2f9d43ebb00c7b94d)) by @tuner
* **app:** zero-length segment features in view attributes ([00de370](https://github.com/genome-spy/genome-spy/commit/00de3701b6c69f2d1605ca1c2986ff99cc04fba2)) by @tuner
* **core:** don't push domains on dataflow reset ([a43450b](https://github.com/genome-spy/genome-spy/commit/a43450bbdae8288fbffd16dda80bdb40771929ea)) by @tuner
* **core:** guard async tooltip updates ([d602af3](https://github.com/genome-spy/genome-spy/commit/d602af3be39c4aea1db807167c8108eb1cd5d6de)), closes [#319](https://github.com/genome-spy/genome-spy/issues/319) by @tuner
* **core:** guard flow node initialization ([3b135f1](https://github.com/genome-spy/genome-spy/commit/3b135f1a06f0824cc4688982a22555635b388bda)) by @tuner
* **core:** ignore duplicate graphics finalize ([4d92898](https://github.com/genome-spy/genome-spy/commit/4d928985197fa0a409ce2fb073a839f60f083910)) by @tuner
* **core:** repropagate collectors on lazy init ([eaf708c](https://github.com/genome-spy/genome-spy/commit/eaf708cd6a53641158d832a8dbf3f25e4cfc4e26)) by @tuner
* **core:** reset stack transform correctly ([803d23b](https://github.com/genome-spy/genome-spy/commit/803d23b71d051cb1398e20808148de34067193a2)) by @tuner
* **core:** skip domain animations before first render ([b78eefe](https://github.com/genome-spy/genome-spy/commit/b78eefe7c853ce9e52dae1fb921f26e22dfba8c9)) by @tuner
* **core:** surface tabix init errors ([ce603c0](https://github.com/genome-spy/genome-spy/commit/ce603c0a435e0ceb8e07be2a7d18d84f3ab6e258)), closes [#302](https://github.com/genome-spy/genome-spy/issues/302) by @tuner

### Features

* **app:** async intent pipeline with metadata readiness + bookmark recovery ([#318](https://github.com/genome-spy/genome-spy/issues/318)) ([266c505](https://github.com/genome-spy/genome-spy/commit/266c50544f36da8a1d5ffead73e887d89e66e229)) by @tuner
* **app:** box, scatter, and bar plots for exploratory analysis ([#315](https://github.com/genome-spy/genome-spy/issues/315)) ([62a6269](https://github.com/genome-spy/genome-spy/commit/62a62691e59f9a7a4b8fc62c9aed66be9f8c1570)) by @tuner
* **app:** integrate selections (point and brush) into provenance ([#322](https://github.com/genome-spy/genome-spy/issues/322)) ([e320437](https://github.com/genome-spy/genome-spy/commit/e320437cd13e6237c2b4cf0edf4a38393ea5ea8c)) by @tuner
* **core:** concat separator rules ([df09b35](https://github.com/genome-spy/genome-spy/commit/df09b35b94dacd1ee10fae6bafb40d8f019540d0)), closes [#180](https://github.com/genome-spy/genome-spy/issues/180) by @tuner
* support multi-field search metadata channels ([766a5c5](https://github.com/genome-spy/genome-spy/commit/766a5c5954c9c1f8767f62d1a847048f467e5223)) by @tuner
* view selectors, scoped visibility, and selector validation ([#321](https://github.com/genome-spy/genome-spy/issues/321)) ([e211858](https://github.com/genome-spy/genome-spy/commit/e2118589337c0f192ceb13afbdc82b87d1d595da)) by @tuner

### Performance Improvements

* **app:** speed up sample layout rendering ([#313](https://github.com/genome-spy/genome-spy/issues/313)) ([a01dbce](https://github.com/genome-spy/genome-spy/commit/a01dbce17d07b3da1618787aedf81cfa3bf0ebb7)) by @tuner

# [0.67.0](https://github.com/genome-spy/genome-spy/compare/v0.66.1...v0.67.0) (2026-01-21)

### Bug Fixes

* **app:** restore visibility before data init ([281573e](https://github.com/genome-spy/genome-spy/commit/281573edc84749d136d48556e4ca46966d6021a8))
* **core:** align chrom/pos rewrite with mark encoding ([42b1d7f](https://github.com/genome-spy/genome-spy/commit/42b1d7ffe4e0e0608ba720fb72d509ebf1010224))
* **core:** keep categorical indices stable ([a88a189](https://github.com/genome-spy/genome-spy/commit/a88a1895d83ad652bd9a0c929bf0f52f4715f03d))

### Features

* **core:** lazy initialize hidden subtrees + stabilize categorical encoding ([#311](https://github.com/genome-spy/genome-spy/issues/311)) ([0455285](https://github.com/genome-spy/genome-spy/commit/0455285b0009bbc38be7e680ad3a51cde17620e7))

### Performance Improvements

* **core:** limit scale domain refresh ([397ca54](https://github.com/genome-spy/genome-spy/commit/397ca54c2480f39573de7adbc1c23737098e4e07))

## [0.66.1](https://github.com/genome-spy/genome-spy/compare/v0.66.0...v0.66.1) (2026-01-19)

**Note:** Version bump only for package @genome-spy/core

# [0.66.0](https://github.com/genome-spy/genome-spy/compare/v0.65.0...v0.66.0) (2026-01-19)

### Bug Fixes

* **core:** set requestLayoutReflow earlier ([78f9765](https://github.com/genome-spy/genome-spy/commit/78f976588d1de2d51477ac03bb569cb7290c3fa9)) by @tuner
* resolve linting and TypeScript errors ([e20514d](https://github.com/genome-spy/genome-spy/commit/e20514d77a7a131c1866684b5ef7ffb442be5f3a)) by @tuner

### Features

* **app:** add scrollbar to SampleView ([#309](https://github.com/genome-spy/genome-spy/issues/309)) ([7bc9de1](https://github.com/genome-spy/genome-spy/commit/7bc9de1a1332ca2036de2bc464ea6ffdb0b6f1fc)) by @tuner
* **core:** dynamic container mutations for concat/layer views ([#307](https://github.com/genome-spy/genome-spy/issues/307)) ([f6fc957](https://github.com/genome-spy/genome-spy/commit/f6fc957ceed30bae139f83d44d4e534ef17586f2)) by @tuner

# [0.65.0](https://github.com/genome-spy/genome-spy/compare/v0.64.0...v0.65.0) (2026-01-14)

### Bug Fixes

* stabilize metadata titles and search init ([f4c0a8c](https://github.com/genome-spy/genome-spy/commit/f4c0a8c1687a4989a990996f103ee13c332162fd)) by @tuner

### Features

* **app:** enable "upload" of custom metadata ([#299](https://github.com/genome-spy/genome-spy/issues/299)) ([3089f97](https://github.com/genome-spy/genome-spy/commit/3089f97bea8ce100551b53ea46191baec6d9f3c2)) by @tuner
* **app:** highlight views when navigating view-visibility menu ([2a2c9b5](https://github.com/genome-spy/genome-spy/commit/2a2c9b516aba74f2277d25cd66fa18f671d7df30)) by @tuner

# [0.64.0](https://github.com/genome-spy/genome-spy/compare/v0.63.0...v0.64.0) (2025-11-27)

### Bug Fixes

* **core:** improve rendering of small text ([1f8a467](https://github.com/genome-spy/genome-spy/commit/1f8a467730db7472d68f04ff16e6b2396fe7aa50)), closes [#288](https://github.com/genome-spy/genome-spy/issues/288) by @tuner
* **core:** tooltip font size ([e796f73](https://github.com/genome-spy/genome-spy/commit/e796f73e67c6af608e752623ca67706155840127)) by @tuner

### Features

* event filters in point selections ([#293](https://github.com/genome-spy/genome-spy/issues/293)) ([25d22d0](https://github.com/genome-spy/genome-spy/commit/25d22d02e02d30374e87a634f0fb5e22f7976ce9)) by @tuner

### Performance Improvements

* **core:** reintroduce flat shading to avoid unnecessary interpolation ([bf3d087](https://github.com/genome-spy/genome-spy/commit/bf3d0873807ea3969d08b83485c93606ae24ab77)), closes [#248](https://github.com/genome-spy/genome-spy/issues/248) by @tuner

# [0.63.0](https://github.com/genome-spy/genome-spy/compare/v0.62.2...v0.63.0) (2025-06-27)

### Bug Fixes

* **core:** minWidth/minHeight in rect mark resulted in blurry rectangles in some cases ([8791019](https://github.com/genome-spy/genome-spy/commit/87910195801d689d31e8212b903be2fc7b077198)) by @tuner
* **core:** multi-point selection on Safari ([ec07b50](https://github.com/genome-spy/genome-spy/commit/ec07b502d32761d43301cb06b5a8d48e5ccbb4d8)) by @tuner

### Features

* **app:** save as PNG button ([#287](https://github.com/genome-spy/genome-spy/issues/287)) ([b15c304](https://github.com/genome-spy/genome-spy/commit/b15c304c1ff3f5326153022be4d6fda10d41565f)) by @tuner

## [0.62.2](https://github.com/genome-spy/genome-spy/compare/v0.62.1...v0.62.2) (2025-06-25)

### Bug Fixes

* **core:** conditional encoding in certain cases ([29e9adc](https://github.com/genome-spy/genome-spy/commit/29e9adc1d26d2376fcf8e01763f7ee1394fb538b)) by @tuner

## [0.62.1](https://github.com/genome-spy/genome-spy/compare/v0.62.0...v0.62.1) (2025-06-25)

### Bug Fixes

* **core:** empty interval selection with index or locus scales ([3dc437a](https://github.com/genome-spy/genome-spy/commit/3dc437afbe308edae6066c59735ce7ffcdf9b5ed)) by @tuner
* **core:** interval selection when both primary and secondary positional channel encode same field ([17d975b](https://github.com/genome-spy/genome-spy/commit/17d975b80cb240ea7a6e673a6d3641beb025f4de)) by @tuner

# [0.62.0](https://github.com/genome-spy/genome-spy/compare/v0.61.1...v0.62.0) (2025-06-25)

### Features

* **core:** accept ExprRef as `size` in `measureText` transform ([fbda439](https://github.com/genome-spy/genome-spy/commit/fbda439d646d0aaeccb2d9119d7db65e55eeeed6)) by @tuner
* **core:** support segment features in `filterScoredLabels` transform ([#286](https://github.com/genome-spy/genome-spy/issues/286)) ([5b35c54](https://github.com/genome-spy/genome-spy/commit/5b35c54a5f161ed83f1ac9b40fca87841f929d68)) by @tuner

### Performance Improvements

* **core:** optimize sorting in collector ([8f362d0](https://github.com/genome-spy/genome-spy/commit/8f362d014163f0bf3de3883e3d0bc56eec5093c6)) by @tuner
* **core:** optimize sorting in collector ([fef8291](https://github.com/genome-spy/genome-spy/commit/fef829163bc881a750e686c4a7e78d8be2078d4e)) by @tuner

## [0.61.1](https://github.com/genome-spy/genome-spy/compare/v0.61.0...v0.61.1) (2025-06-16)

### Bug Fixes

* **core:** zoom extent and geometric zoom ([8e469d3](https://github.com/genome-spy/genome-spy/commit/8e469d3aa28cf72858e86c28cad1313f6c232c3f)) by @

# [0.61.0](https://github.com/genome-spy/genome-spy/compare/v0.60.1...v0.61.0) (2025-06-16)

### Bug Fixes

* **core:** remove `console.log` from binnedIndex ([41c225c](https://github.com/genome-spy/genome-spy/commit/41c225c1c02dbc247c5c9d23f731d372cec28445)) by @tuner
* **core:** remove more console.logs in binnedIndex ([95baf95](https://github.com/genome-spy/genome-spy/commit/95baf950c216bcc97503537fcfe3e4e433b939fb)) by @tuner
* **core:** scale inside conditional encoding ([c2ddb7e](https://github.com/genome-spy/genome-spy/commit/c2ddb7e719d2a3647dae44829445b02a80240a9e)) by @tuner
* **core:** scale resolution on conditional convenience channels ([7eb2a87](https://github.com/genome-spy/genome-spy/commit/7eb2a8788855282963d9acdc8db9eb1aea913db2)) by @tuner
* **core:** silence erroneous warning about identical arrays in `mergeObjects` ([63b91b9](https://github.com/genome-spy/genome-spy/commit/63b91b95b5d4140d316e05877795fbfae734add6)) by @tuner
* **core:** wrong organism in refseqGene tooltips ([b3ee6af](https://github.com/genome-spy/genome-spy/commit/b3ee6af3a7a64ce964095ae7359dd157589f4664)), closes [#279](https://github.com/genome-spy/genome-spy/issues/279) by @tuner

### Features

* **core:** filter by interval selection ([7dfe326](https://github.com/genome-spy/genome-spy/commit/7dfe326b4c14bbd2c768f37fdfb606354bd69daa)) by @tuner

## [0.60.1](https://github.com/genome-spy/genome-spy/compare/v0.60.0...v0.60.1) (2025-06-12)

### Bug Fixes

* **core:** fixes a problem in brushing initiation introduced in an earlier fix ([4c7992d](https://github.com/genome-spy/genome-spy/commit/4c7992d5ba5c26337c666a9fcd99935c434c0105)) by @tuner

# [0.60.0](https://github.com/genome-spy/genome-spy/compare/v0.59.0...v0.60.0) (2025-06-12)

### Bug Fixes

* **core:** clear uniqueIdIndex in collector upon reset ([6dfdbe4](https://github.com/genome-spy/genome-spy/commit/6dfdbe4ea286e3069f8a453006f3f42a6ff3fe3a)) by @tuner
* **core:** don't drag selection with second  mouse button ([3f63c00](https://github.com/genome-spy/genome-spy/commit/3f63c001baab7f6db14c8e13bd997cbee423318b)) by @tuner
* **core:** flickering mouse cursor when brushing a new selection ([ea0d6db](https://github.com/genome-spy/genome-spy/commit/ea0d6db83f6b9111ed467e3916fb200e6e2aeb16)) by @tuner
* **core:** more click/selection behavior fixes ([fc8e01a](https://github.com/genome-spy/genome-spy/commit/fc8e01a9956df2b28d1c95f848a24401e6907806)) by @tuner
* **core:** prevent picking of elements under the selection rect ([58ccd7a](https://github.com/genome-spy/genome-spy/commit/58ccd7aaa8d8c14715fa86d7c1a975e674f817cf)) by @tuner
* **core:** sticky tooltip misbehavior when panning by dragging ([744f30e](https://github.com/genome-spy/genome-spy/commit/744f30e3bb3b55c3a3ff942f4d3e53512cab1de9)) by @tuner

### Features

* **core:** allows the array of source urls to be placed in a separate file ([998cfe4](https://github.com/genome-spy/genome-spy/commit/998cfe428e6ef04d28a83f9f60277c553e0eaddf)) by @tuner
* **core:** dblclick clears interval selection ([5094e65](https://github.com/genome-spy/genome-spy/commit/5094e65d9100d5ddd8d4db7b645db481a8087fb4)) by @tuner
* **core:** drop shadows for rect marks ([#282](https://github.com/genome-spy/genome-spy/issues/282)) ([866cc4e](https://github.com/genome-spy/genome-spy/commit/866cc4e4e94600ba8e1675ebb40144766f339a6e)) by @tuner
* **core:** hatched rectangles ([d8366e1](https://github.com/genome-spy/genome-spy/commit/d8366e1a521420e0b098d7ed4752b49fddec6389)), closes [#280](https://github.com/genome-spy/genome-spy/issues/280) by @tuner
* **core:** interval selection ([#281](https://github.com/genome-spy/genome-spy/issues/281)) ([200d280](https://github.com/genome-spy/genome-spy/commit/200d280517f66f086d6440dc61ec243b346f60e9)) by @tuner
* **core:** keep selected `point`s visible regardless of score-based semantic zoom ([5538df9](https://github.com/genome-spy/genome-spy/commit/5538df90988b90661c451389fcdef102728aa371)) by @tuner
* **core:** provide d3 `format` function in the expression language ([fff83eb](https://github.com/genome-spy/genome-spy/commit/fff83eba8703ee7742df5a6bb63da550848999f6)) by @tuner
* **core:** show measures in the selection rectangle ([edfd516](https://github.com/genome-spy/genome-spy/commit/edfd516cd9cec159d4040238a3f0fb16602ad289)) by @tuner
* **core:** sticky tooltips ([6bf7be4](https://github.com/genome-spy/genome-spy/commit/6bf7be4589ce9fc821d047c1dec12ef8bc7b2962)), closes [#86](https://github.com/genome-spy/genome-spy/issues/86) by @tuner

# [0.59.0](https://github.com/genome-spy/genome-spy/compare/v0.58.3...v0.59.0) (2025-02-13)

### Bug Fixes

* **core:** throw error if number of regex capture groups in regexFold is not one ([2641856](https://github.com/genome-spy/genome-spy/commit/26418568aa890c9b3ea17642ac6d42c590cd466a)), closes [#273](https://github.com/genome-spy/genome-spy/issues/273) by @tuner

### Features

* **app:** hierarchical metadata attributes ([#274](https://github.com/genome-spy/genome-spy/issues/274)) ([dc4c483](https://github.com/genome-spy/genome-spy/commit/dc4c48321e59b925f868eda5090f6ba54a04e25b)) by @tuner

## [0.58.1](https://github.com/genome-spy/genome-spy/compare/v0.58.0...v0.58.1) (2024-12-10)

### Bug Fixes

* **core:** null values in tooltip ([e472345](https://github.com/genome-spy/genome-spy/commit/e472345574543b4715fdf48a8fd2d2909ec856ba))

# [0.58.0](https://github.com/genome-spy/genome-spy/compare/v0.57.0...v0.58.0) (2024-12-07)

### Bug Fixes

* **core:** add missing expression function `replace` ([66dd63e](https://github.com/genome-spy/genome-spy/commit/66dd63e3a5e7e000a9778519b997ed282d26d9f1)) by @tuner
* **core:** fix BamSource to work with new gmod/bam-js package ([7c64820](https://github.com/genome-spy/genome-spy/commit/7c648207d8fd95086bc40794d75b09d54ee694a6)) by @
* **core:** improve error messages ([bdeea93](https://github.com/genome-spy/genome-spy/commit/bdeea93084b5610e65ac26fd37a9fcb66e67e89f)) by @tuner

### Features

* **app:** highlight views in dataflow inspector ([b737634](https://github.com/genome-spy/genome-spy/commit/b7376341e3af37143fdb1be95ff03b3e5da27e54)) by @tuner
* **core:** add support for `vcf` files ([7f5b3a5](https://github.com/genome-spy/genome-spy/commit/7f5b3a561fc98646e4b4e8efed57a4101cb9a37b)) by @tuner
* **core:** show nested objects in tooltip ([b645cf9](https://github.com/genome-spy/genome-spy/commit/b645cf9b07b81b15b28ed0e63b3b66d42c9ca845)) by @tuner

# [0.57.0](https://github.com/genome-spy/genome-spy/compare/v0.56.1...v0.57.0) (2024-11-28)

### Bug Fixes

* **app:** extract sample ids from data when they are not specified explicitly ([b074ee3](https://github.com/genome-spy/genome-spy/commit/b074ee35ba4915910ad86a0e581ad41f89cb4306)) by @tuner
* **core:** show a more informative error on unknown chromosomes ([2c6582e](https://github.com/genome-spy/genome-spy/commit/2c6582ec6c016b4a8b18e48036c9598468a3b14b)) by @tuner
* **core:** show a useful error message when a scheme contains invalid colors ([7b637fb](https://github.com/genome-spy/genome-spy/commit/7b637fb9f4e32df65e94b94508d663c6f5e262ff)) by @tuner

### Features

* **core:** throw error when accessing unknown data fields ([357f39b](https://github.com/genome-spy/genome-spy/commit/357f39b40c5cb9e8a0d6272513648fe07f486289)) by @tuner

## [0.56.1](https://github.com/genome-spy/genome-spy/compare/v0.56.0...v0.56.1) (2024-08-21)

### Bug Fixes

* **core:** selection config wasn't always handled properly ([c2dbbc8](https://github.com/genome-spy/genome-spy/commit/c2dbbc85505886f71a0fbfbe8079774dae32b90f)) by @tuner

# [0.56.0](https://github.com/genome-spy/genome-spy/compare/v0.55.0...v0.56.0) (2024-08-20)

### Features

* multi-point selection ([#264](https://github.com/genome-spy/genome-spy/issues/264)) ([0e9c1bd](https://github.com/genome-spy/genome-spy/commit/0e9c1bd4a7f95ac24e2c62a5a22d41cf16f77cfd)) by @tuner

# [0.55.0](https://github.com/genome-spy/genome-spy/compare/v0.54.0...v0.55.0) (2024-08-12)

### Features

* dataflow inspector ([#262](https://github.com/genome-spy/genome-spy/issues/262)) ([1d6a6bf](https://github.com/genome-spy/genome-spy/commit/1d6a6bf45732cb959fc644e78c50e3a9e0290051)) by @tuner

# [0.54.0](https://github.com/genome-spy/genome-spy/compare/v0.53.1...v0.54.0) (2024-08-06)

### Bug Fixes

* incorrect grid lines when `"excluded"` scale and axis resolutions are used ([a09719f](https://github.com/genome-spy/genome-spy/commit/a09719f21f3760d7b05b1a60639276f6bc820564))

### Features

* **core:** add aggregate functions to `"aggregate"`transform ([a73d229](https://github.com/genome-spy/genome-spy/commit/a73d229bdbfa1aa7e4c782d329c301035e88d0b5))

## [0.53.1](https://github.com/genome-spy/genome-spy/compare/v0.53.0...v0.53.1) (2024-05-16)

### Bug Fixes

* **core:** minify favicon svg and remove namespaced attributes ([e9a3619](https://github.com/genome-spy/genome-spy/commit/e9a3619fe52dc3264a195f68ae81978444ffdf18)) by @tuner

# [0.53.0](https://github.com/genome-spy/genome-spy/compare/v0.52.0...v0.53.0) (2024-05-16)

### Bug Fixes

* **core:** `filterScoredLabels` transform sometimes failed to generate data, missing gene symbols ([40a7dc2](https://github.com/genome-spy/genome-spy/commit/40a7dc29e5b42b84dc6ac0f4228094e2d9c571c4)), closes [#252](https://github.com/genome-spy/genome-spy/issues/252) by @tuner
* **core:** fix stack overflow in `setupCloner` ([fad696f](https://github.com/genome-spy/genome-spy/commit/fad696f14edc93bbcd9529790af9a3219f0b83c5)) by @tuner
* **core:** handle format's responseType in `UrlSource` ([14d6609](https://github.com/genome-spy/genome-spy/commit/14d660936e6e2a25135bf2ce1b4b3d35d01fed88)) by @tuner

### Performance Improvements

* **core:** create new cloners for batches only when the data objects' shape changes ([2eeb9c3](https://github.com/genome-spy/genome-spy/commit/2eeb9c34f28361e15f44f0b12413155bb4f2ddaa)) by @tuner

# [0.52.0](https://github.com/genome-spy/genome-spy/compare/v0.51.0...v0.52.0) (2024-04-26)

### Bug Fixes

* **core:** automatically append slash to baseUrls in the view spec ([5834209](https://github.com/genome-spy/genome-spy/commit/5834209e67698d173938f7c922db820210fdf193))
* **core:** bundle the genome assemblies into the JavaScript library ([80d1645](https://github.com/genome-spy/genome-spy/commit/80d16453260546979675dfcdd9ab5b1ff7649e23))

### Features

* **core:** publish view `width` and `height` as parameters ([fa8a2bc](https://github.com/genome-spy/genome-spy/commit/fa8a2bc3f2a9cac1dc15b4591a87219be25fdce1))

# [0.51.0](https://github.com/genome-spy/genome-spy/compare/v0.50.2...v0.51.0) (2024-03-26)

### Bug Fixes

* **app:** don't show views with non-configurable visibility in the menu ([4dc6165](https://github.com/genome-spy/genome-spy/commit/4dc61656a4a282ede59d535db6c4d8faf67c9521))

## [0.50.2](https://github.com/genome-spy/genome-spy/compare/v0.50.1...v0.50.2) (2024-03-22)

### Bug Fixes

* **core:** data source merging in flowOptimizer ([854492a](https://github.com/genome-spy/genome-spy/commit/854492a6c15f79a4c4e359799cfaa6c97ffb4588))
* **core:** don't override `baseUrl` when importing views using a url ([d08bce8](https://github.com/genome-spy/genome-spy/commit/d08bce8e68def1cd47dd7ac7d2be8bac32f3e6fb))
* **core:** missing padding when the root view didn't fill the whole container ([32b9b6d](https://github.com/genome-spy/genome-spy/commit/32b9b6dc48f3732e81832bc4001e553867aaf484)), closes [#250](https://github.com/genome-spy/genome-spy/issues/250)
* **core:** randomly missing axes ([7d27354](https://github.com/genome-spy/genome-spy/commit/7d27354ffb8b3715ec943d9eb51906a3e2b948d9))

## [0.50.1](https://github.com/genome-spy/genome-spy/compare/v0.50.0...v0.50.1) (2024-03-14)

### Bug Fixes

* **core:** canvas sizing when it doesn't fill the whole container ([393cab5](https://github.com/genome-spy/genome-spy/commit/393cab50501f6c868120d4d40f5ea25316e3416c))
* **core:** clipped tooltip ([e48ad69](https://github.com/genome-spy/genome-spy/commit/e48ad698975bf7925750c6e4e91e06fcaeb21f30))
* **core:** silence the "mark has no data" error ([30b251b](https://github.com/genome-spy/genome-spy/commit/30b251b7d526d8de03a4d5aaae0b8f087f729f39)), closes [#247](https://github.com/genome-spy/genome-spy/issues/247)

# [0.50.0](https://github.com/genome-spy/genome-spy/compare/v0.49.0...v0.50.0) (2024-03-08)

### Bug Fixes

* **core:** `"link"` mark's other endpoint didn't quite reach the target ([fc10bff](https://github.com/genome-spy/genome-spy/commit/fc10bff3502eae93135f6c7f3082a86f207bac9d))
* **core:** domain extraction when using bar charts ([75c15c4](https://github.com/genome-spy/genome-spy/commit/75c15c4f8bd61e18c4d6388164f01d8aae8da2ae))
* **core:** fieldDef typings, allow multiple conditions in ValueDefs ([130b5c8](https://github.com/genome-spy/genome-spy/commit/130b5c8f971b0791a5ad4c90ab0bad2c041694d7))
* **core:** improve antialiasing of text and link marks ([5feda3f](https://github.com/genome-spy/genome-spy/commit/5feda3f1ca8924500750c45d85afc3a997e83709))
* **core:** mark property typings, more accurate JSON schema ([fb46978](https://github.com/genome-spy/genome-spy/commit/fb469784131fe74f12d0a611c0e54336768a2df2))
* **core:** point selections when tooltip is disabled ([aad6b33](https://github.com/genome-spy/genome-spy/commit/aad6b33a3f9a04f9d5d8b6593de02bc656fa4c1d))
* **core:** precision issue when zooming a scale with a transition animation ([a474eaf](https://github.com/genome-spy/genome-spy/commit/a474eaf38ddc6d79bffd0605d1cce7de380a260d))
* **core:** rounding of viewport clipping coords ([30f9a21](https://github.com/genome-spy/genome-spy/commit/30f9a21f4863158af1b602c78c2b6600a88fc9ae))

### Features

* **core:** support `minPickingSize` in `"point"` mark ([09a478a](https://github.com/genome-spy/genome-spy/commit/09a478ac46929bfacdca53a4ce9298969b6542ff))

# [0.49.0](https://github.com/genome-spy/genome-spy/compare/v0.48.2...v0.49.0) (2024-03-06)

### Bug Fixes

* **core:** improve font manager error messages ([b04bb9e](https://github.com/genome-spy/genome-spy/commit/b04bb9e5be80423d9afd79ed5c95ad33da33348c))

### Features

* **core:** point selections and conditional encoding ([#245](https://github.com/genome-spy/genome-spy/issues/245)) ([864b070](https://github.com/genome-spy/genome-spy/commit/864b070baad0b386071dae33a8022674af119f91))

## [0.48.2](https://github.com/genome-spy/genome-spy/compare/v0.48.1...v0.48.2) (2024-02-22)

### Bug Fixes

* **core:** 32 instead of 24 bits for uniqueId in picking ([7ae8b7c](https://github.com/genome-spy/genome-spy/commit/7ae8b7c31817746251cdb2c5fdd211a2abd86ffe)), closes [#218](https://github.com/genome-spy/genome-spy/issues/218)

### Performance Improvements

* **core:** improve picking and tooltip performance ([#243](https://github.com/genome-spy/genome-spy/issues/243)) ([17e92fc](https://github.com/genome-spy/genome-spy/commit/17e92fc4486406732b25b2c74a79a6ff3a7ec8ce))

## [0.48.1](https://github.com/genome-spy/genome-spy/compare/v0.48.0...v0.48.1) (2024-02-20)

### Bug Fixes

* **core:** also handle `y` direction in drag-to-pan inertia ([88f53e8](https://github.com/genome-spy/genome-spy/commit/88f53e8d194ec9225a9384e83b2db37642846223))
* **core:** categorical data in `"link"` mark misbehaved ([14a4d8d](https://github.com/genome-spy/genome-spy/commit/14a4d8d99c822d45b142a47f5016808e55949f73)), closes [#231](https://github.com/genome-spy/genome-spy/issues/231)
* **core:** rect mark's corner radius ([42af3a6](https://github.com/genome-spy/genome-spy/commit/42af3a6f9cf2247f509c2d2c20447da84f10cd01))

# [0.48.0](https://github.com/genome-spy/genome-spy/compare/v0.47.0...v0.48.0) (2024-02-20)

### Features

* **core:** add inertia to drag-to-pan interaction ([#240](https://github.com/genome-spy/genome-spy/issues/240)) ([8b00907](https://github.com/genome-spy/genome-spy/commit/8b00907ec3d970165f7808da00977a911fc6bb59))

# [0.47.0](https://github.com/genome-spy/genome-spy/compare/v0.46.1...v0.47.0) (2024-02-16)

### Bug Fixes

* **core:** improve mouse wheel inertia ([5dc308c](https://github.com/genome-spy/genome-spy/commit/5dc308c426c08f588ef76acb712d1bc8c300220c)), closes [#166](https://github.com/genome-spy/genome-spy/issues/166)
* **core:** scale padding ([a1e6a0e](https://github.com/genome-spy/genome-spy/commit/a1e6a0ea7320b45044a333ff4e226e057719294b))
* **core:** use `JSON.stringify` in facetCoords InternMap ([e0e195a](https://github.com/genome-spy/genome-spy/commit/e0e195a95451daf4db66a2ea016bdabb1c98fe62))
* **core:** vertexArrayObject issue ([3c71c7e](https://github.com/genome-spy/genome-spy/commit/3c71c7ea5c932328664216f4b89accdaacd82b7d))

### Features

* **core:** `zoomLevel` param ([79eb70c](https://github.com/genome-spy/genome-spy/commit/79eb70c0549c44013747324b2c5771f2b5e27d5f))
* **core:** add `powerPreference` to embed options ([f3af4a0](https://github.com/genome-spy/genome-spy/commit/f3af4a04c759eab992f362ab02644d94ed819da9))
* **core:** lerp-smoothed scrollbar animation ([#238](https://github.com/genome-spy/genome-spy/issues/238)) ([971c4a5](https://github.com/genome-spy/genome-spy/commit/971c4a546f0e19554aa3288984c48fc56a79982d)), closes [#166](https://github.com/genome-spy/genome-spy/issues/166)
* **core:** support `"text"`, `"number"`, and `"color"` in param input bindings ([1820427](https://github.com/genome-spy/genome-spy/commit/1820427e406655f8cd5a00bc7dc7e0f4bf78bb42))

### Performance Improvements

* **core:** improve picking (hover, click) performance ([a3a6889](https://github.com/genome-spy/genome-spy/commit/a3a68898c9aa79ab378b8ed666d4ec56d7477848))

## [0.46.1](https://github.com/genome-spy/genome-spy/compare/v0.46.0...v0.46.1) (2024-02-13)

### Bug Fixes

* **core:** param scopes in `formula` and `filter` transforms ([4a4c3f3](https://github.com/genome-spy/genome-spy/commit/4a4c3f305a6b9b23ac2a99cc367a401e41581a81))

### Performance Improvements

* **core:** optimize `coverage` transform a bit ([25c7375](https://github.com/genome-spy/genome-spy/commit/25c737519f9ab0de06de6d8a2e95aee2572f3f5c))

# [0.46.0](https://github.com/genome-spy/genome-spy/compare/v0.45.0...v0.46.0) (2024-02-12)

### Bug Fixes

* **core:** allow `undefined` in expressions ([d2334c9](https://github.com/genome-spy/genome-spy/commit/d2334c96b8bfeaf3e4afd31a6c9a9982f30c91ce))
* **core:** properly reset RangeMap entries when Collector receives an empty dataset ([494423f](https://github.com/genome-spy/genome-spy/commit/494423f5323481deb5848d7a3391e743cced651c))

### Features

* **core:** change the way import params are defined ([17d4e05](https://github.com/genome-spy/genome-spy/commit/17d4e0512f5b02d322744d0216448af9ea924c4b))
* **core:** import templates defined within the specification ([6877b15](https://github.com/genome-spy/genome-spy/commit/6877b1592afea0d61e4890c7760cb9c9cdf3d932))
* **core:** show error indicator for failed lazy data loading ([74248c7](https://github.com/genome-spy/genome-spy/commit/74248c70001fab1b599a3c6008215715ee2669bf))
* **core:** show loading indicator for `UrlSource` ([1b583fe](https://github.com/genome-spy/genome-spy/commit/1b583fe99025e89c7160c83e29556c252d437183))
* **core:** support params in filter and formula transforms ([11d9626](https://github.com/genome-spy/genome-spy/commit/11d9626d60dbe400ed4e280bedeff796759e223c))

# [0.45.0](https://github.com/genome-spy/genome-spy/compare/v0.44.0...v0.45.0) (2024-02-08)

### Bug Fixes

* **core:** exprRef in view title ([cede00e](https://github.com/genome-spy/genome-spy/commit/cede00e3e7b2cbacbce71e8661f831b72d1d946d))

### Features

* **core:** more ExprRefs to `"text"` mark properties ([732f264](https://github.com/genome-spy/genome-spy/commit/732f26440f4db6b772b55dc9e0878829de5f41ac))
* **core:** parameterized imports ([d9d8ec7](https://github.com/genome-spy/genome-spy/commit/d9d8ec72b2d2af0264e32683386d0e2108f59665)), closes [#56](https://github.com/genome-spy/genome-spy/issues/56)
* **core:** support ExprRefs in `inwardStroke` and `fillGradientStrength` props of `"point"` mark ([45727a5](https://github.com/genome-spy/genome-spy/commit/45727a540e054f4e2caf16633eba21652fe9451d))
* **core:** support ExprRefs in `semanticZoomFraction` property ([5961c1e](https://github.com/genome-spy/genome-spy/commit/5961c1eb0553ded24291679c1c61f7e2ffcca30a))
* **core:** support ExprRefs in BigBed and BigWig data sources ([b8681dd](https://github.com/genome-spy/genome-spy/commit/b8681dda4be242737b1195192894ea51fb0ffcf8))
* remove `sampleFacetPadding` property and the special handling of point sizes ([7121a7e](https://github.com/genome-spy/genome-spy/commit/7121a7eace30e65531dbe039edc157c3a568ffad))
* scoped parameters ([#235](https://github.com/genome-spy/genome-spy/issues/235)) ([975fe29](https://github.com/genome-spy/genome-spy/commit/975fe29a8dd3e868f63946fcd9bf4937faaa3176))
* support ExprRefs in `url` and `sequence` data sources ([58dad1c](https://github.com/genome-spy/genome-spy/commit/58dad1cf18ac424fca2a9ddff2780b2518079866))

# [0.44.0](https://github.com/genome-spy/genome-spy/compare/v0.43.3...v0.44.0) (2024-01-30)

### Bug Fixes

* **core:** fix a bug introduced in the previous fix ([b650b94](https://github.com/genome-spy/genome-spy/commit/b650b94020fb6e1fb4e687d828dc42b4ae9b4004))
* **core:** improve windowed lazy data loading logic ([7d9028e](https://github.com/genome-spy/genome-spy/commit/7d9028e947290684e24407275228dca0fd83dce5)), closes [#221](https://github.com/genome-spy/genome-spy/issues/221)

### Features

* **core:** allow scale ranges to be specified using parameters ([#228](https://github.com/genome-spy/genome-spy/issues/228)) ([caf3b68](https://github.com/genome-spy/genome-spy/commit/caf3b68c9a60d3670c9414158573405e7a0066d5))
* **core:** parameter-driven mark properties ([#227](https://github.com/genome-spy/genome-spy/issues/227)) ([2af6d35](https://github.com/genome-spy/genome-spy/commit/2af6d35c9da55bea71b18070334e8867561ec6a7))
* **core:** support `expr`s in `datum`s in `ChannelDef`s ([7099b04](https://github.com/genome-spy/genome-spy/commit/7099b044140767b44e2414d09374804f054092a7)), closes [#205](https://github.com/genome-spy/genome-spy/issues/205)

## [0.43.3](https://github.com/genome-spy/genome-spy/compare/v0.43.2...v0.43.3) (2024-01-22)

### Performance Improvements

* **core:** stupid fast bed parser ([b5b0776](https://github.com/genome-spy/genome-spy/commit/b5b0776e13264aac71ee6741b926f690d64a21fb))

## [0.43.2](https://github.com/genome-spy/genome-spy/compare/v0.43.1...v0.43.2) (2024-01-19)

### Bug Fixes

* **core:** flush queue in `coverage` transform before each facet batch ([19b3246](https://github.com/genome-spy/genome-spy/commit/19b3246fd16f15b1c1d51a2391dd78650c760715))

### Performance Improvements

* **core:** optimize the custom bed parser ([1112e53](https://github.com/genome-spy/genome-spy/commit/1112e53e20d6b131ee9ec3366926a42708f755c8))
* **core:** use callback, not iterator in `kWayMerge` ([361213a](https://github.com/genome-spy/genome-spy/commit/361213a3f84bfa048093baa5cb79f4a54b8ebfb4))

## [0.43.1](https://github.com/genome-spy/genome-spy/compare/v0.43.0...v0.43.1) (2024-01-18)

### Performance Improvements

* **core:** implement an optimized bed parser ([c1d1067](https://github.com/genome-spy/genome-spy/commit/c1d106789710ef8ff795b65afc9a8bc2d2d51b36))
* **core:** improve ´rect´ mark performance, add even more unrolling ([6b9e7c9](https://github.com/genome-spy/genome-spy/commit/6b9e7c9fb0a0a2a2e25496fff293fe1b6249507c))
* **core:** use `Uint16Array` for categorical vertex arrays ([1e3a9c7](https://github.com/genome-spy/genome-spy/commit/1e3a9c737873bde4de9ca848f14109c7c7f5b43f))
* **core:** use `Uint32Array` as vertex buffer for `index` and `locus` scale ([#224](https://github.com/genome-spy/genome-spy/issues/224)) ([85f54a3](https://github.com/genome-spy/genome-spy/commit/85f54a38b466d26b4f96c1a5eef6b8b659e81a68))

# [0.43.0](https://github.com/genome-spy/genome-spy/compare/v0.42.2...v0.43.0) (2024-01-16)

### Features

* **core:** allow disabling sorting and indexing the data by `x` channel ([2899241](https://github.com/genome-spy/genome-spy/commit/2899241e203e33fe51811ccb5878adcd0ab6b240))

### Performance Improvements

* **core:** don't use `d3-array`'s `group` to group facets. Its slow ([01f7b01](https://github.com/genome-spy/genome-spy/commit/01f7b019b5557a8e2e09517cbc809579fbfae904))
* **core:** more unrolling to `arrayBuilder` ([7f2d130](https://github.com/genome-spy/genome-spy/commit/7f2d130f040fe3675acd3b9968a9f5459b0b6949))
* **core:** optimize `regexFold` transform ([2386137](https://github.com/genome-spy/genome-spy/commit/2386137236c89e884add20804502fa2d308e1417))

## [0.42.2](https://github.com/genome-spy/genome-spy/compare/v0.42.1...v0.42.2) (2024-01-12)

### Performance Improvements

* **core:** also deduplicate vertex buffers when discretizing scale is used ([97cf3e5](https://github.com/genome-spy/genome-spy/commit/97cf3e50d4f8e6833bf94d48f63d3e46290e1183))

## [0.42.1](https://github.com/genome-spy/genome-spy/compare/v0.42.0...v0.42.1) (2024-01-12)

### Performance Improvements

* **core:** add caching to indexer (of categorical values) ([6e0734c](https://github.com/genome-spy/genome-spy/commit/6e0734c498e373c3bb762c7061ec262278a455aa))
* **core:** deduplicate vertex buffers that share the same quantitative field ([118196d](https://github.com/genome-spy/genome-spy/commit/118196d9b9d055092ad675b9167e35125636fb90))
* **core:** use `gl_VertexID` to calculate rect corners ([26cdf4b](https://github.com/genome-spy/genome-spy/commit/26cdf4b98e76ef389e97842f997de5d5bcffdaaf))

# [0.42.0](https://github.com/genome-spy/genome-spy/compare/v0.41.0...v0.42.0) (2024-01-11)

### Bug Fixes

* **core:** disable binned vertex indexing if data are unordered ([3309919](https://github.com/genome-spy/genome-spy/commit/33099191392c0d90827cf1a6d76de0635798d40e)), closes [#142](https://github.com/genome-spy/genome-spy/issues/142)
* **core:** observe `devicePixelRatio` and rerender when it changes ([3df60cd](https://github.com/genome-spy/genome-spy/commit/3df60cda67e3b632579c7b84032673d9a5e61a7f)), closes [#208](https://github.com/genome-spy/genome-spy/issues/208)

### Features

* **core:** add better debouncing configuration to lazy data sources ([57dcba9](https://github.com/genome-spy/genome-spy/commit/57dcba996060f49f3f706cf190fe83ad9979797f)), closes [#204](https://github.com/genome-spy/genome-spy/issues/204)
* **core:** throw an error if regex in `regexFold` transform does not match any column ([ef7bee7](https://github.com/genome-spy/genome-spy/commit/ef7bee7ba48ac2d13712d496fde589d3d12b9e42))
* **core:** visual indicator for lazy-loading status ([cb59657](https://github.com/genome-spy/genome-spy/commit/cb596574d1283f056625f73c4d30e715b84bc703)), closes [#157](https://github.com/genome-spy/genome-spy/issues/157)

### Performance Improvements

* **core:** remove unnecessary `bindVertexArray` call in `"link"` mark ([b6b71f3](https://github.com/genome-spy/genome-spy/commit/b6b71f3815120ab518ea5f5b653d661266d4517d))
* **core:** use `ext.drawArraysInstancedBaseInstanceWEBGL` in `"link"` mark ([1de9e18](https://github.com/genome-spy/genome-spy/commit/1de9e1844a0bc23117f4ed82e781618f5a4deb1c)), closes [#214](https://github.com/genome-spy/genome-spy/issues/214)

# [0.41.0](https://github.com/genome-spy/genome-spy/compare/v0.40.0...v0.41.0) (2023-12-20)

### Features

* experimental param-driven mark properties ([#212](https://github.com/genome-spy/genome-spy/issues/212)) ([2a3bda5](https://github.com/genome-spy/genome-spy/commit/2a3bda539d073ed4c887f1b074486fc48deb3c88))

# [0.40.0](https://github.com/genome-spy/genome-spy/compare/v0.39.0...v0.40.0) (2023-12-18)

### Bug Fixes

* **core:** fix locus/index scale precision issue on macOS Sonoma ([8a6c934](https://github.com/genome-spy/genome-spy/commit/8a6c93496942b29c9d588d9d62a7687f5d31c0c1))

### Features

* **core:** add new `"link"` mark props: `maxChordLength` and `arcFadingDistance` ([d72de62](https://github.com/genome-spy/genome-spy/commit/d72de62d97cdfdf9b85d5b607855247c776acd3e))

# [0.39.0](https://github.com/genome-spy/genome-spy/compare/v0.38.0...v0.39.0) (2023-12-12)

### Bug Fixes

* **app:** sample faceting in `"link"` mark ([33a9a5f](https://github.com/genome-spy/genome-spy/commit/33a9a5f39c48e9cd27c0e1b3d9ab4b7b8dce995d)), closes [#198](https://github.com/genome-spy/genome-spy/issues/198)

### Features

* **core:** add `minPickingSize` prop to `link` mark ([fac1fbd](https://github.com/genome-spy/genome-spy/commit/fac1fbd8f06f28a1e081b969853c0aacaa6f23e3)), closes [#84](https://github.com/genome-spy/genome-spy/issues/84)
* **core:** clamp `"link"` mark's apex to viewport edge ([4c26e3a](https://github.com/genome-spy/genome-spy/commit/4c26e3a6b6894dc33d197fb6184096f8c23d24c7)), closes [#206](https://github.com/genome-spy/genome-spy/issues/206)
* **core:** more shapes and props for the `"link"` mark ([7e99459](https://github.com/genome-spy/genome-spy/commit/7e994599117520055521eee307cc9d41eded3b77)), closes [#199](https://github.com/genome-spy/genome-spy/issues/199)
* **core:** new `"tick-up"`, `"tick-right"`, etc. point shapes ([bd4c92d](https://github.com/genome-spy/genome-spy/commit/bd4c92dac14fad4657948af935711eecbfa6611d)), closes [#196](https://github.com/genome-spy/genome-spy/issues/196)

# [0.38.0](https://github.com/genome-spy/genome-spy/compare/v0.37.4...v0.38.0) (2023-11-24)

### Bug Fixes

* better error message when an app spec is loaded with core package ([193be81](https://github.com/genome-spy/genome-spy/commit/193be81f68e2b147cb1b314138d9048163d521a4)), closes [#171](https://github.com/genome-spy/genome-spy/issues/171)

### Features

* **core:** viewportWidth/Height and scrollbars ([#194](https://github.com/genome-spy/genome-spy/issues/194)) ([8a51b77](https://github.com/genome-spy/genome-spy/commit/8a51b778ddabd9ded2e35e934b668ed8cb8a775f))

## [0.37.4](https://github.com/genome-spy/genome-spy/compare/v0.37.3...v0.37.4) (2023-11-07)

### Bug Fixes

* **core:** `import.meta.env.DEV` failed with webpack ([bdb0709](https://github.com/genome-spy/genome-spy/commit/bdb07096979aa3071fd8cf1d7e79cf96e83a697a))

## [0.37.3](https://github.com/genome-spy/genome-spy/compare/v0.37.2...v0.37.3) (2023-11-07)

### Bug Fixes

* **core:** global object was broken in expressions ([c8ece1d](https://github.com/genome-spy/genome-spy/commit/c8ece1d8f3883aed29c01d301d47b06bf1b613a8))

## [0.37.2](https://github.com/genome-spy/genome-spy/compare/v0.37.1...v0.37.2) (2023-09-29)

**Note:** Version bump only for package @genome-spy/core

## [0.37.1](https://github.com/genome-spy/genome-spy/compare/v0.37.0...v0.37.1) (2023-09-28)

**Note:** Version bump only for package @genome-spy/core

# [0.37.0](https://github.com/genome-spy/genome-spy/compare/v0.36.1...v0.37.0) (2023-09-28)

### Features

* **core:** version bump ([3b53d1e](https://github.com/genome-spy/genome-spy/commit/3b53d1ee1ffa745c11bcdb409701aeda7f0e1f65))

## [0.36.1](https://github.com/genome-spy/genome-spy/compare/v0.36.0...v0.36.1) (2023-08-28)

### Bug Fixes

* **core:** update scale domains when container view has shared scale but independent (dynamic) data ([6b551a3](https://github.com/genome-spy/genome-spy/commit/6b551a3166c7e77c24de7c666c928343aa1e32e6)), closes [#183](https://github.com/genome-spy/genome-spy/issues/183)

# [0.36.0](https://github.com/genome-spy/genome-spy/compare/v0.35.0...v0.36.0) (2023-08-18)

### Bug Fixes

* **core:** replace Axis with GenomeAxis in the schema ([e22d60e](https://github.com/genome-spy/genome-spy/commit/e22d60e770540d9db6ce5a9c0a937574f54ea4bd))

# [0.35.0](https://github.com/genome-spy/genome-spy/compare/v0.34.0...v0.35.0) (2023-08-16)

### Features

* `flatten` transform ([d22ea35](https://github.com/genome-spy/genome-spy/commit/d22ea35139c17566289b957bb45f95db5be92b2c))
* gff3 with tabix ([#177](https://github.com/genome-spy/genome-spy/issues/177)) ([6e69ce9](https://github.com/genome-spy/genome-spy/commit/6e69ce9646f4629de219d04b32339750af822597))

# [0.34.0](https://github.com/genome-spy/genome-spy/compare/v0.33.0...v0.34.0) (2023-06-16)

### Bug Fixes

* **app:** handle explicit child view width in `SampleView` ([fb580e5](https://github.com/genome-spy/genome-spy/commit/fb580e5a179f0794e8712f6b61181e4211e48ea0))
* **core:** handle interaction events also in UnitView ([b30af23](https://github.com/genome-spy/genome-spy/commit/b30af23a63347b841fa59fce00968ed7737183e8))
* **core:** propagate interaction events to all layers ([af7e900](https://github.com/genome-spy/genome-spy/commit/af7e900f9eb95e0e88c988e8309a1765fbc42dfe))

### Features

* **app:** allow sorting, filtering non-genomic data ([d7bb194](https://github.com/genome-spy/genome-spy/commit/d7bb194de3ce95c212ec6f19d4c975bb9374f5ea))

# [0.33.0](https://github.com/genome-spy/genome-spy/compare/v0.32.2...v0.33.0) (2023-06-07)

### Bug Fixes

* **app:** extracting samples from data was broken ([8843ec5](https://github.com/genome-spy/genome-spy/commit/8843ec555f7a80ead9b5f972d1c3c36daf07ac7f))
* **app:** handling of paddings in `SampleView` ([b3b2eba](https://github.com/genome-spy/genome-spy/commit/b3b2eba0f02c4d9dc6cf49889e86125e672d8e18))
* **app:** hide axis grids from view visibility dropdown ([c219918](https://github.com/genome-spy/genome-spy/commit/c2199184e1ae8f20a715f213fd4655a43b9345cb))
* **core:** `setViewport` misbehaved when clipRect was set but mark had no clip property set ([c4e7e08](https://github.com/genome-spy/genome-spy/commit/c4e7e08a6214103d595d1889c62ed6edd0f77139))
* **core:** viewport rounding error handling ([2e220da](https://github.com/genome-spy/genome-spy/commit/2e220da3ea066da31f6f4b4544bc6a622efccba5))

### Features

* **app:** support axes, grid lines, and view background in SampleView ([e68cf4b](https://github.com/genome-spy/genome-spy/commit/e68cf4be801948f0931274782c435e5a92b58d72))
* **core:** add `background` prop for canvas background color ([ffacfa5](https://github.com/genome-spy/genome-spy/commit/ffacfa5831c3722a24272853c0dc47fadb86a505))
* **core:** optimize `concat`'s default scale resolution for track-based layouts ([024c527](https://github.com/genome-spy/genome-spy/commit/024c527bb8ab23d3d59e87570901b930702b7077))
* **core:** shared axes in `concat` views ([#162](https://github.com/genome-spy/genome-spy/issues/162)) ([eaa660b](https://github.com/genome-spy/genome-spy/commit/eaa660b049ae5a17384d0095776ad8a510cd5c14))

### Performance Improvements

* **core:** don't set viewport if the size of the clipped coords is zero ([44dc9f0](https://github.com/genome-spy/genome-spy/commit/44dc9f0ed28d8bc7878032867122bb8cbaf38c30))

## [0.32.2](https://github.com/genome-spy/genome-spy/compare/v0.32.1...v0.32.2) (2023-05-24)

### Bug Fixes

* **core:** add missing zoom-transition to other continuous scales ([60dcf9c](https://github.com/genome-spy/genome-spy/commit/60dcf9cfda211b0b0579583fc2dc16d9c729bf71))
* **core:** axis ticks and grid lines were sometimes out of sync ([dd88840](https://github.com/genome-spy/genome-spy/commit/dd888403fa63a010143bea991e65a7fe2e32663a))
* **core:** update scale domains when data are loaded lazily ([b70376b](https://github.com/genome-spy/genome-spy/commit/b70376be5964f69afe296c0d72f27b6d098027b0))

## [0.32.1](https://github.com/genome-spy/genome-spy/compare/v0.32.0...v0.32.1) (2023-05-23)

### Bug Fixes

* **core:** don't fetch lazy data for hidden views ([eaa0ce4](https://github.com/genome-spy/genome-spy/commit/eaa0ce46984784b143d5585a688770043a5e38f2))

# [0.32.0](https://github.com/genome-spy/genome-spy/compare/v0.31.2...v0.32.0) (2023-05-22)

### Features

* **core:** lazy loading for indexed FASTA, BigWig, and BigBed ([#153](https://github.com/genome-spy/genome-spy/issues/153)) ([aeb20f2](https://github.com/genome-spy/genome-spy/commit/aeb20f21e5db97a9b7fca81f7fc4663c85129c78))

## [0.31.2](https://github.com/genome-spy/genome-spy/compare/v0.31.1...v0.31.2) (2023-05-09)

**Note:** Version bump only for package @genome-spy/core

## [0.31.1](https://github.com/genome-spy/genome-spy/compare/v0.31.0...v0.31.1) (2023-05-09)

**Note:** Version bump only for package @genome-spy/core

# [0.31.0](https://github.com/genome-spy/genome-spy/compare/v0.30.3...v0.31.0) (2023-05-09)

### Features

* axis grids ([b9533ad](https://github.com/genome-spy/genome-spy/commit/b9533ad77e61e135bdab9247a0d8512bed9178cd)), closes [#58](https://github.com/genome-spy/genome-spy/issues/58)

## [0.30.3](https://github.com/genome-spy/genome-spy/compare/v0.30.2...v0.30.3) (2023-05-03)

### Bug Fixes

* **core:** prevent excessive CloneTransform optimization ([3ce08ff](https://github.com/genome-spy/genome-spy/commit/3ce08ff6e89869a1bf50327836ad1055c1799e98))

## [0.30.2](https://github.com/genome-spy/genome-spy/compare/v0.30.1...v0.30.2) (2023-04-28)

**Note:** Version bump only for package @genome-spy/core

## [0.30.1](https://github.com/genome-spy/genome-spy/compare/v0.30.0...v0.30.1) (2023-04-28)

### Bug Fixes

* **core:** eliminate blurry edges in stretched sequence logo letters ([36365b3](https://github.com/genome-spy/genome-spy/commit/36365b31425179e774e07d7d196ec24cef466ed8))

# [0.30.0](https://github.com/genome-spy/genome-spy/compare/v0.29.0...v0.30.0) (2023-04-21)

### Bug Fixes

* **core:** don't snap zooming to marks with a constant value on x or y channel ([c43dcb4](https://github.com/genome-spy/genome-spy/commit/c43dcb4844acf983c515aa93c92256a767447e60))
* **core:** inconsistency between d3 and shader on threshold scale and interpolated scheme ([6d3d55e](https://github.com/genome-spy/genome-spy/commit/6d3d55e872aa63759544eb5f5ecddfc39ea42d09))
* **core:** incosistent color scheme when extracting domain from data ([ab523ad](https://github.com/genome-spy/genome-spy/commit/ab523ad9966be6daf917cd2da7d879429dbad8fc)), closes [#69](https://github.com/genome-spy/genome-spy/issues/69)
* **core:** piecewise color scale with more than three thresholds ([a033ef3](https://github.com/genome-spy/genome-spy/commit/a033ef3c98c9e14adf98cd9d0343cc2ffcb5f225))

### Performance Improvements

* **core:** use bitmask instead of modulo in `splitHighPrecision` ([0e502dd](https://github.com/genome-spy/genome-spy/commit/0e502ddccd8bd6973f4d198d65f8faf3c3a1c2da))

# [0.29.0](https://github.com/genome-spy/genome-spy/compare/v0.28.5...v0.29.0) (2023-03-24)

### Bug Fixes

* **app:** apply padding to SampleView when it's at root ([9f0f38c](https://github.com/genome-spy/genome-spy/commit/9f0f38c480399b32727f2e5e643f6b324c53cca9))
* **app:** render view background in sample facets ([2c78625](https://github.com/genome-spy/genome-spy/commit/2c7862593ba4ab27bbe991790c7972758f6c37ef))
* **core:** don't show tooltips for data objects with no properties ([01217cd](https://github.com/genome-spy/genome-spy/commit/01217cd5d9b7badad7bf3e4ec7b6be3524abfc52))
* **core:** repeat non-faceted data in facet views ([ad71cf2](https://github.com/genome-spy/genome-spy/commit/ad71cf2bb68a1b700eeddfc9a10306c27bdb9f09))

### Features

* **app:** make sample and attribute labels configurable ([8ac82db](https://github.com/genome-spy/genome-spy/commit/8ac82dba87b322a2d2688f9f53a065f193feabe9))

## [0.28.3](https://github.com/genome-spy/genome-spy/compare/v0.28.2...v0.28.3) (2023-03-09)

**Note:** Version bump only for package @genome-spy/core

## [0.28.2](https://github.com/genome-spy/genome-spy/compare/v0.28.1...v0.28.2) (2023-03-09)

### Performance Improvements

* **core:** re-enable caching of view size ([5f28392](https://github.com/genome-spy/genome-spy/commit/5f28392ea3938018098a6e041f80f208d1691f94))

## [0.28.1](https://github.com/genome-spy/genome-spy/compare/v0.28.0...v0.28.1) (2023-03-07)

### Bug Fixes

* **core:** fix a bug introduced in the previous commit ([f397ed5](https://github.com/genome-spy/genome-spy/commit/f397ed5fc22902b8b65966dcc49e45234eb21e66))

# [0.28.0](https://github.com/genome-spy/genome-spy/compare/v0.27.1...v0.28.0) (2023-03-07)

### Bug Fixes

* **core:** respect explicit GridView sizes ([2e4c6d9](https://github.com/genome-spy/genome-spy/commit/2e4c6d944cac3d6a2a039a4eb8941bbf8c289614)), closes [#117](https://github.com/genome-spy/genome-spy/issues/117)

# [0.27.0](https://github.com/genome-spy/genome-spy/compare/v0.26.1...v0.27.0) (2022-11-03)

### Features

* **app:** add "remove group" action ([#135](https://github.com/genome-spy/genome-spy/issues/135)) ([4f9269e](https://github.com/genome-spy/genome-spy/commit/4f9269e37f286059878bb2cd27a95d2536a42c30))

# [0.26.0](https://github.com/genome-spy/genome-spy/compare/v0.25.1...v0.26.0) (2022-10-24)

**Note:** Version bump only for package @genome-spy/core

## [0.25.1](https://github.com/genome-spy/genome-spy/compare/v0.25.0...v0.25.1) (2022-10-13)

### Bug Fixes

* **core:** disastrous performance on Safari ([544cb80](https://github.com/genome-spy/genome-spy/commit/544cb80ece4c81e97ef08a86f2033291b74a8e4f))

# [0.25.0](https://github.com/genome-spy/genome-spy/compare/v0.24.2...v0.25.0) (2022-10-12)

### Features

* dynamic named data ([#132](https://github.com/genome-spy/genome-spy/issues/132)) ([b60f7f0](https://github.com/genome-spy/genome-spy/commit/b60f7f002944103e65f33844bdf66e3c6f2bf059))

## [0.24.2](https://github.com/genome-spy/genome-spy/compare/v0.24.1...v0.24.2) (2022-10-04)

### Bug Fixes

* **core:** link marks disappeared when zooming in ([299addb](https://github.com/genome-spy/genome-spy/commit/299addbc114f8bdde0900205569d224835d2e996)), closes [#124](https://github.com/genome-spy/genome-spy/issues/124)

# [0.24.0](https://github.com/genome-spy/genome-spy/compare/v0.23.0...v0.24.0) (2022-09-07)

### Bug Fixes

* **core:** point items disappeared when zooming close enough ([6969dd2](https://github.com/genome-spy/genome-spy/commit/6969dd2933d6247941ff75cb19292f89dc0bdacc))

# [0.23.0](https://github.com/genome-spy/genome-spy/compare/v0.22.1...v0.23.0) (2022-08-09)

### Features

* **app:** reset the state when bookmark tour ends ([8c1f00b](https://github.com/genome-spy/genome-spy/commit/8c1f00bafd34565cbc9af8b7120e0d9d3357b027))

## [0.22.1](https://github.com/genome-spy/genome-spy/compare/v0.22.0...v0.22.1) (2022-06-01)

### Performance Improvements

* **core:** semantic zoom on Apple Silicon GPU ([0a32f08](https://github.com/genome-spy/genome-spy/commit/0a32f081e531be21cbeef96b46ccffff5009a2a2))

# [0.22.0](https://github.com/genome-spy/genome-spy/compare/v0.21.0...v0.22.0) (2022-05-31)

### Features

* **app:** use a unique view name to identify an attribute (really!) ([185c110](https://github.com/genome-spy/genome-spy/commit/185c110c04887516c5d2a7da7b00f2c6be4f3414))

# [0.21.0](https://github.com/genome-spy/genome-spy/compare/v0.20.0...v0.21.0) (2022-05-24)

### Performance Improvements

* more uniform optimizations ([6039d12](https://github.com/genome-spy/genome-spy/commit/6039d125447637a5bc89c4a21c436076b55bc82a))
* optimize rect mark's uniforms ([2a6d587](https://github.com/genome-spy/genome-spy/commit/2a6d587df2328878fc0865dc15e35be78729158f))
* optimize rendering pipeline ([c587bf5](https://github.com/genome-spy/genome-spy/commit/c587bf5648884d9ea9eb94c92642a495c9f6c52e))
* optimize rendering pipeline, minor stuff ([8414998](https://github.com/genome-spy/genome-spy/commit/8414998882c1ae72ede0aadccc3f64181b717ad3))
* optimize rule mark's uniforms ([826138f](https://github.com/genome-spy/genome-spy/commit/826138fc4ff5bc8dc2aad50dd9d5e2e1e6fd6d31))
* replace x bisector with binned index ([7d05649](https://github.com/genome-spy/genome-spy/commit/7d0564940bf52f37e1294b7691dd7e01dcece9b4))
* use uniform block for viewport stuff ([5079214](https://github.com/genome-spy/genome-spy/commit/50792149368c66d745e4cd65ae9ccc394cb8c7b1))

# [0.20.0](https://github.com/genome-spy/genome-spy/compare/v0.19.1...v0.20.0) (2022-05-11)

### Features

* **core:** view titles ([#101](https://github.com/genome-spy/genome-spy/issues/101)) ([b14bd85](https://github.com/genome-spy/genome-spy/commit/b14bd85aa487619cf3b42f1e364a803ef65a8921))

## [0.19.1](https://github.com/genome-spy/genome-spy/compare/v0.19.0...v0.19.1) (2022-04-11)

### Bug Fixes

* **core:** fix the previous commit (snapping) ([a0341b0](https://github.com/genome-spy/genome-spy/commit/a0341b0b5bade7d32531d15a11bce9c6f640e52a))
* **core:** snapping to point mark when zooming ([aaebdc2](https://github.com/genome-spy/genome-spy/commit/aaebdc261a9dbff9c3761835b08de2e0e30ffb52))
* gets rid of fp64 gpu hack that fails on m1 macs ([2aade84](https://github.com/genome-spy/genome-spy/commit/2aade84b2c8cdab45af3cf69fbfb644318c4a6b6)), closes [#92](https://github.com/genome-spy/genome-spy/issues/92)

# [0.19.0](https://github.com/genome-spy/genome-spy/compare/v0.18.1...v0.19.0) (2022-03-28)

### Bug Fixes

* **core:** don't remove CloneTransform that comes after Collector ([e0246e2](https://github.com/genome-spy/genome-spy/commit/e0246e2bdf578982efe77b347c972909e0a2fd74))

### Features

* **app:** accept single chromosomes and single-base coords in the search field. Closes [#85](https://github.com/genome-spy/genome-spy/issues/85) ([eef5a44](https://github.com/genome-spy/genome-spy/commit/eef5a44334804bc5991dd5b74e4e22376a1915a2))
* **app:** allow transforms in `aggregateSamples` ([8aed769](https://github.com/genome-spy/genome-spy/commit/8aed76923c840e69fc0798cdeb9acc56e983eef6))

## [0.18.1](https://github.com/genome-spy/genome-spy/compare/v0.18.0...v0.18.1) (2022-02-10)

**Note:** Version bump only for package @genome-spy/core

# [0.18.0](https://github.com/genome-spy/genome-spy/compare/v0.17.1...v0.18.0) (2022-02-10)

### Bug Fixes

* **app:** relative URLs in bookmark notes now use spec's path as baseUrl ([4ccb433](https://github.com/genome-spy/genome-spy/commit/4ccb433d3663d189fa2bc29a1b7ee28e63925597))

### Features

* **playground:** validate spec using JSON schema ([#87](https://github.com/genome-spy/genome-spy/issues/87)) ([d6fc84c](https://github.com/genome-spy/genome-spy/commit/d6fc84c7c090931c96b8e571701249090a03f49e))

# [0.17.0](https://github.com/tuner/genome-spy/compare/v0.16.0...v0.17.0) (2022-01-21)

**Note:** Version bump only for package @genome-spy/core

# [0.16.0](https://github.com/tuner/genome-spy/compare/v0.15.0...v0.16.0) (2021-12-20)

### Bug Fixes

* paddingInner of glsl band scale when there's only a single band ([31005e1](https://github.com/tuner/genome-spy/commit/31005e18c95633f5587d5fff55df83acd6142c51))

### Features

* support categorical datums ([fc25855](https://github.com/tuner/genome-spy/commit/fc25855af07886cb31efce86f1c3a30d0e12fa94)), closes [#54](https://github.com/tuner/genome-spy/issues/54)

# [0.15.0](https://github.com/tuner/genome-spy/compare/v0.14.2...v0.15.0) (2021-11-25)

**Note:** Version bump only for package @genome-spy/core

## [0.14.2](https://github.com/tuner/genome-spy/compare/v0.14.1...v0.14.2) (2021-11-24)

**Note:** Version bump only for package @genome-spy/core

## [0.14.1](https://github.com/tuner/genome-spy/compare/v0.14.0...v0.14.1) (2021-11-23)

### Bug Fixes

* a dummy change. testing versioning/publishing ([efba81f](https://github.com/tuner/genome-spy/commit/efba81f769f38a8a11d1c68078d64d249c5e7c46))

# [0.14.0](https://github.com/tuner/genome-spy/compare/v0.13.0...v0.14.0) (2021-11-23)

### Features

* split GenomeSpy "core" and "app" into separate, scoped npm packages ([#62](https://github.com/tuner/genome-spy/issues/62)) ([f3efe78](https://github.com/tuner/genome-spy/commit/f3efe783961a416d8b12b96d563a963b87829dfa))

# [0.13.0](https://github.com/tuner/genome-spy/compare/v0.12.1...v0.13.0) (2021-11-22)

### Bug Fixes

* disable "Restore defaults" in view visibility menu when in default state ([41c059b](https://github.com/tuner/genome-spy/commit/41c059b848fa8ccfe9241455061178a2596beff5))
* incorrect form validation in quantitative filtering dialog ([4a75ecd](https://github.com/tuner/genome-spy/commit/4a75ecda52cd3f395a6918059bcf76290eb3a49f))
* suppress tooltip when a dropdown menu is open ([a84bcf5](https://github.com/tuner/genome-spy/commit/a84bcf5d7158875140da30043f127a99c1585e44))

### Features

* advanced filtering dialog for sample metadata and other attributes ([#61](https://github.com/tuner/genome-spy/issues/61)) ([3cc0b25](https://github.com/tuner/genome-spy/commit/3cc0b25a607726d1193a05d53ad6b663ccdd753f))

## [0.12.1](https://github.com/tuner/genome-spy/compare/v0.12.0...v0.12.1) (2021-11-18)

### Bug Fixes

* left/right alignment of rotated, ranged text ([#59](https://github.com/tuner/genome-spy/issues/59)) ([0c6104d](https://github.com/tuner/genome-spy/commit/0c6104d133609792ce02e9a545844fca7697d574))
* vertical (orient: left/right) genome axis was rendered incorrectly ([#60](https://github.com/tuner/genome-spy/issues/60)) ([03e5383](https://github.com/tuner/genome-spy/commit/03e5383f4b117c6ef66bb40daac53da3ccafc410))

# [0.12.0](https://github.com/tuner/genome-spy/compare/v0.11.0...v0.12.0) (2021-11-16)

### Bug Fixes

* attribute context menu ([4a09a73](https://github.com/tuner/genome-spy/commit/4a09a737fbd880ccceef338f6fca724c4d889503))
* properly access `storeHelper` in mergeFacets transform ([04e57e6](https://github.com/tuner/genome-spy/commit/04e57e65d9309a80fb1eb97a9833a74d33f6c0cd))
* track undo states only for slices registered to provenance ([01ab1aa](https://github.com/tuner/genome-spy/commit/01ab1aab634de894abf9aba8568a7b9cadf793bb))

### Features

* configurable view visibilities ([#57](https://github.com/tuner/genome-spy/issues/57)) ([c99a828](https://github.com/tuner/genome-spy/commit/c99a828764403bb15cd43595bd70e74b48370742))

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
