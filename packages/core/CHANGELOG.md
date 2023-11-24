# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

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
