# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [0.86.0](https://github.com/genome-spy/genome-spy/compare/v0.85.0...v0.86.0) (2026-09-03)

### Bug Fixes

* **webgpu-renderer:** align WGSL scale mappings with d3 ([#489](https://github.com/genome-spy/genome-spy/issues/489)) ([2cca166](https://github.com/genome-spy/genome-spy/commit/2cca16671f42a6ea8b13106b64e34bde90d42725)) by @tuner

### Features

* **webgpu:** add development-only WebGPU renderer ([#479](https://github.com/genome-spy/genome-spy/issues/479)) ([6538841](https://github.com/genome-spy/genome-spy/commit/6538841d9be276db7d3536dadf84644ae0ec9707)), closes [hi#zoom](https://github.com/hi/issues/zoom) [hi#cardinality](https://github.com/hi/issues/cardinality) [hi#count](https://github.com/hi/issues/count) [#362](https://github.com/genome-spy/genome-spy/issues/362) by @tuner
* **webgpu:** improve antialiasing, compositing, and raster export ([#498](https://github.com/genome-spy/genome-spy/issues/498)) ([ea2c7fc](https://github.com/genome-spy/genome-spy/commit/ea2c7fc68336846ad1f05997382b11f4da12d65c)) by @tuner

### Performance Improvements

* **webgpu-renderer:** share equivalent program and font resources ([#494](https://github.com/genome-spy/genome-spy/issues/494)) ([cf50618](https://github.com/genome-spy/genome-spy/commit/cf50618c41bbbdd622a227618eab42382b814bfe)) by @tuner
* **webgpu:** improve render reuse, diagnostics, and Firefox compatibility ([#501](https://github.com/genome-spy/genome-spy/issues/501)) ([a7d0708](https://github.com/genome-spy/genome-spy/commit/a7d0708e73c1d169d952446286a8c4cd0f5b58c4)) by @tuner
