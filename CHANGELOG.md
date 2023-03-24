# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [0.29.0](https://github.com/tuner/genome-spy/compare/v0.28.5...v0.29.0) (2023-03-24)


### Bug Fixes

* **app:** apply padding to SampleView when it's at root ([9f0f38c](https://github.com/tuner/genome-spy/commit/9f0f38c480399b32727f2e5e643f6b324c53cca9))
* **app:** render view background in sample facets ([2c78625](https://github.com/tuner/genome-spy/commit/2c7862593ba4ab27bbe991790c7972758f6c37ef))
* **core:** don't show tooltips for data objects with no properties ([01217cd](https://github.com/tuner/genome-spy/commit/01217cd5d9b7badad7bf3e4ec7b6be3524abfc52))
* **core:** repeat non-faceted data in facet views ([ad71cf2](https://github.com/tuner/genome-spy/commit/ad71cf2bb68a1b700eeddfc9a10306c27bdb9f09))


### Features

* **app:** make sample and attribute labels configurable ([8ac82db](https://github.com/tuner/genome-spy/commit/8ac82dba87b322a2d2688f9f53a065f193feabe9))





## [0.28.5](https://github.com/tuner/genome-spy/compare/v0.28.4...v0.28.5) (2023-03-16)


### Bug Fixes

* **app:** update the link in the help button ([6a25d4e](https://github.com/tuner/genome-spy/commit/6a25d4e5c361e6dd334dd2dd854037cb7b87e832))





## [0.28.4](https://github.com/tuner/genome-spy/compare/v0.28.3...v0.28.4) (2023-03-09)

**Note:** Version bump only for package root





## [0.28.3](https://github.com/tuner/genome-spy/compare/v0.28.2...v0.28.3) (2023-03-09)

**Note:** Version bump only for package root





## [0.28.2](https://github.com/tuner/genome-spy/compare/v0.28.1...v0.28.2) (2023-03-09)


### Performance Improvements

* **core:** re-enable caching of view size ([5f28392](https://github.com/tuner/genome-spy/commit/5f28392ea3938018098a6e041f80f208d1691f94))





## [0.28.1](https://github.com/tuner/genome-spy/compare/v0.28.0...v0.28.1) (2023-03-07)


### Bug Fixes

* **core:** fix a bug introduced in the previous commit ([f397ed5](https://github.com/tuner/genome-spy/commit/f397ed5fc22902b8b65966dcc49e45234eb21e66))





# [0.28.0](https://github.com/tuner/genome-spy/compare/v0.27.1...v0.28.0) (2023-03-07)


### Bug Fixes

* **core:** respect explicit GridView sizes ([2e4c6d9](https://github.com/tuner/genome-spy/commit/2e4c6d944cac3d6a2a039a4eb8941bbf8c289614)), closes [#117](https://github.com/tuner/genome-spy/issues/117)


### Features

* **app:** show filter-by-attribute examples in search help ([7c42c8e](https://github.com/tuner/genome-spy/commit/7c42c8e636b46e1bdbb649d674b944efeadea754)), closes [#126](https://github.com/tuner/genome-spy/issues/126)





## [0.27.1](https://github.com/tuner/genome-spy/compare/v0.27.0...v0.27.1) (2022-11-04)


### Bug Fixes

* **app:** an exact search match wasn't clickable in advanced filter dialog ([88d81e3](https://github.com/tuner/genome-spy/commit/88d81e33aed2271fcd2142268f4c3be05ab34e52))
* **app:** show GenomeSpy version in toolbar ([140b703](https://github.com/tuner/genome-spy/commit/140b703a208dc66d19ea875ba79e9718f144e3da))





# [0.27.0](https://github.com/tuner/genome-spy/compare/v0.26.1...v0.27.0) (2022-11-03)


### Features

* **app:** add "remove group" action ([#135](https://github.com/tuner/genome-spy/issues/135)) ([4f9269e](https://github.com/tuner/genome-spy/commit/4f9269e37f286059878bb2cd27a95d2536a42c30))
* **app:** add search field to categorical advanced filter ([6acfc89](https://github.com/tuner/genome-spy/commit/6acfc896051788c20c970e83e2ea9057648cb544)), closes [#136](https://github.com/tuner/genome-spy/issues/136)
* **app:** show group sizes in "group by thresholds" dialog ([14d4a69](https://github.com/tuner/genome-spy/commit/14d4a691da14bff5c13341c12ab9d2ab20da1a31))





## [0.26.1](https://github.com/tuner/genome-spy/compare/v0.26.0...v0.26.1) (2022-10-24)


### Bug Fixes

* **app:** histogram thresholds were broken after minification ([b67077f](https://github.com/tuner/genome-spy/commit/b67077f5152cd7c4aaa9a18e49482d548d744003))





# [0.26.0](https://github.com/tuner/genome-spy/compare/v0.25.1...v0.26.0) (2022-10-24)


### Features

* **app:** add histogram to advanced filtering and grouping ([#134](https://github.com/tuner/genome-spy/issues/134)) ([fb9ae38](https://github.com/tuner/genome-spy/commit/fb9ae38e38e9c6c11439f3f946ad745e88ab7389))





## [0.25.1](https://github.com/tuner/genome-spy/compare/v0.25.0...v0.25.1) (2022-10-13)


### Bug Fixes

* **core:** disastrous performance on Safari ([544cb80](https://github.com/tuner/genome-spy/commit/544cb80ece4c81e97ef08a86f2033291b74a8e4f))





# [0.25.0](https://github.com/tuner/genome-spy/compare/v0.24.2...v0.25.0) (2022-10-12)


### Features

* **app:** activate closeup (peeking) from context menu ([9591960](https://github.com/tuner/genome-spy/commit/9591960302643e1505bd804f2a75e8433d47c14b)), closes [#129](https://github.com/tuner/genome-spy/issues/129)
* **app:** round the left corners of group labels ([3efbc51](https://github.com/tuner/genome-spy/commit/3efbc518e90c4f55f33a504266f9667a1db3a7db))
* dynamic named data ([#132](https://github.com/tuner/genome-spy/issues/132)) ([b60f7f0](https://github.com/tuner/genome-spy/commit/b60f7f002944103e65f33844bdf66e3c6f2bf059))





## [0.24.2](https://github.com/tuner/genome-spy/compare/v0.24.1...v0.24.2) (2022-10-04)


### Bug Fixes

* **core:** link marks disappeared when zooming in ([299addb](https://github.com/tuner/genome-spy/commit/299addbc114f8bdde0900205569d224835d2e996)), closes [#124](https://github.com/tuner/genome-spy/issues/124)





## [0.24.1](https://github.com/tuner/genome-spy/compare/v0.24.0...v0.24.1) (2022-09-07)

**Note:** Version bump only for package root





# [0.24.0](https://github.com/tuner/genome-spy/compare/v0.23.0...v0.24.0) (2022-09-07)


### Bug Fixes

* **app:** order ordinal groups correctly ([344b761](https://github.com/tuner/genome-spy/commit/344b7616bcfb2822de831344e0a428accd74c8f2)), closes [#114](https://github.com/tuner/genome-spy/issues/114)
* **core:** point items disappeared when zooming close enough ([6969dd2](https://github.com/tuner/genome-spy/commit/6969dd2933d6247941ff75cb19292f89dc0bdacc))


### Features

* **app:** add "Retain first n categories of xxx" action ([4debaf7](https://github.com/tuner/genome-spy/commit/4debaf719b2fbc41fa74dbdb215645041fb2c477)), closes [#108](https://github.com/tuner/genome-spy/issues/108)
* **app:** add "retain group-wise matched samples" action ([1d1aeb4](https://github.com/tuner/genome-spy/commit/1d1aeb4b5dd12ac4ddc37f1c17499b116bb87b50)), closes [#113](https://github.com/tuner/genome-spy/issues/113)





# [0.23.0](https://github.com/tuner/genome-spy/compare/v0.22.1...v0.23.0) (2022-08-09)


### Bug Fixes

* **app:** improve link color in dialogs ([31d3aa8](https://github.com/tuner/genome-spy/commit/31d3aa8f941f3ea1a7914723facae1df160b2629))


### Features

* **app:** reset the state when bookmark tour ends ([8c1f00b](https://github.com/tuner/genome-spy/commit/8c1f00bafd34565cbc9af8b7120e0d9d3357b027))





## [0.22.1](https://github.com/tuner/genome-spy/compare/v0.22.0...v0.22.1) (2022-06-01)


### Performance Improvements

* **core:** semantic zoom on Apple Silicon GPU ([0a32f08](https://github.com/tuner/genome-spy/commit/0a32f081e531be21cbeef96b46ccffff5009a2a2))





# [0.22.0](https://github.com/tuner/genome-spy/compare/v0.21.0...v0.22.0) (2022-05-31)


### Bug Fixes

* **app:** keyboard shortcuts during a bookmark tour ([33bcfaa](https://github.com/tuner/genome-spy/commit/33bcfaa2bcda7e14bdf2327f4cbcd3ff5347a9e1))
* **app:** prevent warning when pressing esc in a dialog ([7b835ae](https://github.com/tuner/genome-spy/commit/7b835aee6118dc4c3f57d5c6be154e0f1c12c955))


### Features

* **app:** short urls to server-side bookmarks ([110a237](https://github.com/tuner/genome-spy/commit/110a2376d76527ad4d2d02d76a9b6fc8343fb822))
* **app:** use a unique view name to identify an attribute (really!) ([185c110](https://github.com/tuner/genome-spy/commit/185c110c04887516c5d2a7da7b00f2c6be4f3414))





# [0.21.0](https://github.com/tuner/genome-spy/compare/v0.20.0...v0.21.0) (2022-05-24)


### Features

* use a unique view name to identify an attribute ([6721b9e](https://github.com/tuner/genome-spy/commit/6721b9e8113974abb42491a390469f00d480e33e))


### Performance Improvements

* more uniform optimizations ([6039d12](https://github.com/tuner/genome-spy/commit/6039d125447637a5bc89c4a21c436076b55bc82a))
* optimize rect mark's uniforms ([2a6d587](https://github.com/tuner/genome-spy/commit/2a6d587df2328878fc0865dc15e35be78729158f))
* optimize rendering pipeline ([c587bf5](https://github.com/tuner/genome-spy/commit/c587bf5648884d9ea9eb94c92642a495c9f6c52e))
* optimize rendering pipeline, minor stuff ([8414998](https://github.com/tuner/genome-spy/commit/8414998882c1ae72ede0aadccc3f64181b717ad3))
* optimize rule mark's uniforms ([826138f](https://github.com/tuner/genome-spy/commit/826138fc4ff5bc8dc2aad50dd9d5e2e1e6fd6d31))
* replace x bisector with binned index ([7d05649](https://github.com/tuner/genome-spy/commit/7d0564940bf52f37e1294b7691dd7e01dcece9b4))
* use uniform block for viewport stuff ([5079214](https://github.com/tuner/genome-spy/commit/50792149368c66d745e4cd65ae9ccc394cb8c7b1))





# [0.20.0](https://github.com/tuner/genome-spy/compare/v0.19.1...v0.20.0) (2022-05-11)


### Bug Fixes

* **app:** adjust attributes' offset to make rects crispier ([e2e178d](https://github.com/tuner/genome-spy/commit/e2e178dca2f11f4969becc1b58396e43f2eb36c6))
* **app:** context menu didn't appear ([dadd57c](https://github.com/tuner/genome-spy/commit/dadd57c4f4059fe53ba51e69d3a9f447a104baa5))
* **app:** padding issue ([847bb8d](https://github.com/tuner/genome-spy/commit/847bb8def3a4b0800774571ee19946307a1554b1)), closes [#97](https://github.com/tuner/genome-spy/issues/97)


### Features

* **core:** view titles ([#101](https://github.com/tuner/genome-spy/issues/101)) ([b14bd85](https://github.com/tuner/genome-spy/commit/b14bd85aa487619cf3b42f1e364a803ef65a8921))





## [0.19.1](https://github.com/tuner/genome-spy/compare/v0.19.0...v0.19.1) (2022-04-11)


### Bug Fixes

* **core:** fix the previous commit (snapping) ([a0341b0](https://github.com/tuner/genome-spy/commit/a0341b0b5bade7d32531d15a11bce9c6f640e52a))
* **core:** snapping to point mark when zooming ([aaebdc2](https://github.com/tuner/genome-spy/commit/aaebdc261a9dbff9c3761835b08de2e0e30ffb52))
* gets rid of fp64 gpu hack that fails on m1 macs ([2aade84](https://github.com/tuner/genome-spy/commit/2aade84b2c8cdab45af3cf69fbfb644318c4a6b6)), closes [#92](https://github.com/tuner/genome-spy/issues/92)
* **playground:** import default spec properly. Fixes [#94](https://github.com/tuner/genome-spy/issues/94) ([0514a10](https://github.com/tuner/genome-spy/commit/0514a1045e1b06f990983ce51150ebd65c402325))





# [0.19.0](https://github.com/tuner/genome-spy/compare/v0.18.1...v0.19.0) (2022-03-28)


### Bug Fixes

* **core:** don't remove CloneTransform that comes after Collector ([e0246e2](https://github.com/tuner/genome-spy/commit/e0246e2bdf578982efe77b347c972909e0a2fd74))


### Features

* **app:** accept single chromosomes and single-base coords in the search field. Closes [#85](https://github.com/tuner/genome-spy/issues/85) ([eef5a44](https://github.com/tuner/genome-spy/commit/eef5a44334804bc5991dd5b74e4e22376a1915a2))
* **app:** advanced filter with "value at locus" ([eebb0e0](https://github.com/tuner/genome-spy/commit/eebb0e0953eedde22e3827ab76a42bab42fc0fb5))
* **app:** allow transforms in `aggregateSamples` ([8aed769](https://github.com/tuner/genome-spy/commit/8aed76923c840e69fc0798cdeb9acc56e983eef6))
* **app:** group samples by threshold on attribute ([dd9e5cf](https://github.com/tuner/genome-spy/commit/dd9e5cf5394d9733c50741369f226dec348be591))





## [0.18.1](https://github.com/tuner/genome-spy/compare/v0.18.0...v0.18.1) (2022-02-10)

**Note:** Version bump only for package root





# [0.18.0](https://github.com/tuner/genome-spy/compare/v0.17.1...v0.18.0) (2022-02-10)


### Bug Fixes

* **app:** hide fullscreen button on unsupported browsers ([e2f2c2a](https://github.com/tuner/genome-spy/commit/e2f2c2a0ed81b3b9d5eb9df77b78b0b82b15b2d6))
* **app:** make font and icon sizes consistent across browsers ([fb1f3d1](https://github.com/tuner/genome-spy/commit/fb1f3d1ec23b290ce8a00d394e0aeb9583f954f4))
* **app:** make spacing of buttons consistent in modal dialogs ([b780c0a](https://github.com/tuner/genome-spy/commit/b780c0ae7a991f46506399d7c53e9f6af6722682))
* **app:** relative URLs in bookmark notes now use spec's path as baseUrl ([4ccb433](https://github.com/tuner/genome-spy/commit/4ccb433d3663d189fa2bc29a1b7ee28e63925597))


### Features

* **playground:** validate spec using JSON schema ([#87](https://github.com/tuner/genome-spy/issues/87)) ([d6fc84c](https://github.com/tuner/genome-spy/commit/d6fc84c7c090931c96b8e571701249090a03f49e))





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


### Bug Fixes

* paddingInner of glsl band scale when there's only a single band ([31005e1](https://github.com/tuner/genome-spy/commit/31005e18c95633f5587d5fff55df83acd6142c51))


### Features

* support categorical datums ([fc25855](https://github.com/tuner/genome-spy/commit/fc25855af07886cb31efce86f1c3a30d0e12fa94)), closes [#54](https://github.com/tuner/genome-spy/issues/54)





# [0.15.0](https://github.com/tuner/genome-spy/compare/v0.14.2...v0.15.0) (2021-11-25)


### Bug Fixes

* **playground:** put genomespy into a scrollable viewport ([e43ea76](https://github.com/tuner/genome-spy/commit/e43ea76e1cb2f1cf11b9cd0e977ce05ffd4ae217))


### Features

* **playground:** add version number to toolbar ([e79551d](https://github.com/tuner/genome-spy/commit/e79551d1111e250dc94db4678a0822615d7864bb))
* **playground:** replace CodeMirror 5 with Monaco ([#64](https://github.com/tuner/genome-spy/issues/64)) ([2f20957](https://github.com/tuner/genome-spy/commit/2f20957139385914091bd11ebc95510f80a3fad4))





## [0.14.2](https://github.com/tuner/genome-spy/compare/v0.14.1...v0.14.2) (2021-11-24)


### Bug Fixes

* **playground:** indent selection with tab ([a01c2a8](https://github.com/tuner/genome-spy/commit/a01c2a85dcad66ea7c069b084d792870d9d682e9))





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
