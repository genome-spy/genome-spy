# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [0.88.0](https://github.com/genome-spy/genome-spy/compare/v0.87.0...v0.88.0) (2026-09-15)

### Features

* support conditional draw order and foreground arc rendering ([#521](https://github.com/genome-spy/genome-spy/issues/521)) ([ffa0b07](https://github.com/genome-spy/genome-spy/commit/ffa0b07ffa5307f596ad9dac2a261a077e08d9ff)) by @tuner
* support selection unions in conditional encodings ([#520](https://github.com/genome-spy/genome-spy/issues/520)) ([a71a15f](https://github.com/genome-spy/genome-spy/commit/a71a15f8db39b89590af4e26fbb40f3c09ed6d65)) by @tuner

# [0.87.0](https://github.com/genome-spy/genome-spy/compare/v0.86.0...v0.87.0) (2026-09-08)

### Bug Fixes

* support dome fading across rendering backends ([47cd5de](https://github.com/genome-spy/genome-spy/commit/47cd5de6d3fc96359cd0342e7c56aacb22784eff)), closes [#502](https://github.com/genome-spy/genome-spy/issues/502) by @tuner

# [0.86.0](https://github.com/genome-spy/genome-spy/compare/v0.85.0...v0.86.0) (2026-09-03)

### Bug Fixes

* **webgpu-renderer:** align WGSL scale mappings with d3 ([#489](https://github.com/genome-spy/genome-spy/issues/489)) ([2cca166](https://github.com/genome-spy/genome-spy/commit/2cca16671f42a6ea8b13106b64e34bde90d42725)) by @tuner

### Features

* **webgpu:** add development-only WebGPU renderer ([#479](https://github.com/genome-spy/genome-spy/issues/479)) ([6538841](https://github.com/genome-spy/genome-spy/commit/6538841d9be276db7d3536dadf84644ae0ec9707)), closes [hi#zoom](https://github.com/hi/issues/zoom) [hi#cardinality](https://github.com/hi/issues/cardinality) [hi#count](https://github.com/hi/issues/count) [#362](https://github.com/genome-spy/genome-spy/issues/362) by @tuner
* **webgpu:** improve antialiasing, compositing, and raster export ([#498](https://github.com/genome-spy/genome-spy/issues/498)) ([ea2c7fc](https://github.com/genome-spy/genome-spy/commit/ea2c7fc68336846ad1f05997382b11f4da12d65c)) by @tuner

### Performance Improvements

* **webgpu-renderer:** share equivalent program and font resources ([#494](https://github.com/genome-spy/genome-spy/issues/494)) ([cf50618](https://github.com/genome-spy/genome-spy/commit/cf50618c41bbbdd622a227618eab42382b814bfe)) by @tuner
* **webgpu:** improve render reuse, diagnostics, and Firefox compatibility ([#501](https://github.com/genome-spy/genome-spy/issues/501)) ([a7d0708](https://github.com/genome-spy/genome-spy/commit/a7d0708e73c1d169d952446286a8c4cd0f5b58c4)) by @tuner
