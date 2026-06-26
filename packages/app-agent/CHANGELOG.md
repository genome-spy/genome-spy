# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.79.1](https://github.com/genome-spy/genome-spy/compare/v0.79.0...v0.79.1) (2026-06-26)

### Bug Fixes

* **app:** align internal app peer ranges ([26406df](https://github.com/genome-spy/genome-spy/commit/26406df3dc8a4f1268df845662946f8151a07743)) by @tuner

# [0.79.0](https://github.com/genome-spy/genome-spy/compare/v0.78.0...v0.79.0) (2026-06-26)

### Bug Fixes

* **app:** clarify matched retention wording ([de96d28](https://github.com/genome-spy/genome-spy/commit/de96d28329cecc52a00c821e3fbbf8e04783cf67)) by @tuner
* **app:** refine first-sample wording ([f0f5a44](https://github.com/genome-spy/genome-spy/commit/f0f5a4467958b4016b89a336eba0f6b8fad42055)) by @tuner

### Features

* **app-agent:** add updated benchmark suite specs ([dc52b4e](https://github.com/genome-spy/genome-spy/commit/dc52b4e21a9878b69c6f6a18d675c6da73a81fcc)) by @okunator
* **app:** support ascending sample sorting ([7174cf3](https://github.com/genome-spy/genome-spy/commit/7174cf397888d9dd141c77989257c5b4e5c73963)) by @tuner
* **inspector:** add GenomeSpy runtime inspector ([#425](https://github.com/genome-spy/genome-spy/issues/425)) ([0151c5d](https://github.com/genome-spy/genome-spy/commit/0151c5db16b825af760a9fbedb3a4f4df838c7a1)) by @tuner

# [0.78.0](https://github.com/genome-spy/genome-spy/compare/v0.77.0...v0.78.0) (2026-06-11)

**Note:** Version bump only for package @genome-spy/app-agent

# [0.77.0](https://github.com/genome-spy/genome-spy/compare/v0.76.0...v0.77.0) (2026-06-04)

### Bug Fixes

* **app-agent:** clarify pooled selection feature summaries ([9707463](https://github.com/genome-spy/genome-spy/commit/970746350eeb1cda69f8af1fc909e064f2ff5f4b)) by @tuner
* **app-agent:** forward agent turn abort signal ([d4e96c2](https://github.com/genome-spy/genome-spy/commit/d4e96c226efc6ec415c2f58b5cb3c04a580c69ea)) by @tuner
* **app-agent:** guide recovery from missing attributes ([0832af2](https://github.com/genome-spy/genome-spy/commit/0832af22d1673b4045ec226ca1c50d1bd8db5f4d)) by @tuner
* **app-agent:** log agent loop failures ([76e011b](https://github.com/genome-spy/genome-spy/commit/76e011b95a3adc0d0d55617fb675e35364ac6556)) by @tuner
* **app-agent:** reject invalid parameter value types ([826dbc4](https://github.com/genome-spy/genome-spy/commit/826dbc4ee30e7ea43d60dbd7fed6cd442b438df9)) by @tuner
* **app-agent:** restore canvas focus when closing chat ([8f93e9b](https://github.com/genome-spy/genome-spy/commit/8f93e9bbb2ff0e5a97e6851e8dc2e08cdb25090e)) by @tuner
* **app-agent:** use wildcard for datum field search ([1e5940c](https://github.com/genome-spy/genome-spy/commit/1e5940cce54735b9e7369aded92a8a4e84c3c780)) by @tuner

### Features

* **app-agent:** agent benchmark workflows ([#381](https://github.com/genome-spy/genome-spy/issues/381)) ([26f1f0f](https://github.com/genome-spy/genome-spy/commit/26f1f0fb1399a145e3f5ab1e81b490d2d2bfef6b)) by @okunator
* **app-agent:** compact sample attributes in agent context ([cbf2dbb](https://github.com/genome-spy/genome-spy/commit/cbf2dbbc6421072589b0c9d4a5afc209b565558d)) by @tuner
* **app-agent:** expose metadata sources to agent ([433bdf9](https://github.com/genome-spy/genome-spy/commit/433bdf9068afc36ce8c7e338a5452ad8a0864477)) by @tuner
* **app-agent:** recover from stuck agent loops ([c2c8219](https://github.com/genome-spy/genome-spy/commit/c2c821989ba7776c67b647d6213241d052e283d3)) by @tuner
* **app:** add sample group-level actions ([#380](https://github.com/genome-spy/genome-spy/issues/380)) ([623d23b](https://github.com/genome-spy/genome-spy/commit/623d23bf071e56b4726fb39de2f4a75c7c27d353)) by @tuner

# [0.76.0](https://github.com/genome-spy/genome-spy/compare/v0.75.0...v0.76.0) (2026-05-25)

### Bug Fixes

* **app-agent:** explain missing selection aggregation op ([a7043df](https://github.com/genome-spy/genome-spy/commit/a7043df806ccbd81366418e59ac60a7b5bcb0fb5)) by @tuner
* **app-agent:** include metadata colors in attribute summaries ([ee71984](https://github.com/genome-spy/genome-spy/commit/ee719846c0d44c6eb09ebacc40486e76f2c3d1c1)) by @tuner
* **app-agent:** keep rejected tool output after volatile context ([91597a9](https://github.com/genome-spy/genome-spy/commit/91597a97569da855acf0a662183e7df98a7fa089)) by @tuner
* **app-agent:** keep volatile context after history ([b3034c4](https://github.com/genome-spy/genome-spy/commit/b3034c48e10f61b5acb3f815eec005de3d39e06c)) by @tuner
* **app-agent:** materialize chat summary set entries ([af4e28e](https://github.com/genome-spy/genome-spy/commit/af4e28e2d744ca84f3dbd4dac9b1039c6419831e)) by @tuner
* **app-agent:** normalize local provider tool output ([e84bb50](https://github.com/genome-spy/genome-spy/commit/e84bb505b3e9f6e381e996e627386cd04ac47c1e)) by @tuner
* **app-agent:** preserve logical brush attributes ([ca8e19d](https://github.com/genome-spy/genome-spy/commit/ca8e19d087f0c302b2dd35756466a3e1e4f135e4)) by @tuner
* **app-agent:** remove clarification support ([e635540](https://github.com/genome-spy/genome-spy/commit/e635540282086fcfa204172943215f72550c8ee0)) by @tuner
* **app-agent:** scope feature filters to derive metadata ([afa206f](https://github.com/genome-spy/genome-spy/commit/afa206ff5b3b06ec66fc03e1a9682144f0f79e12)) by @tuner
* **app-agent:** split app agent subpath bundles ([ab374c0](https://github.com/genome-spy/genome-spy/commit/ab374c0f936006d646e4de671c7994b9bcf517bc)) by @tuner
* **app-agent:** type narrow selection aggregation notes ([8f8480f](https://github.com/genome-spy/genome-spy/commit/8f8480f6c1cceb2d8f64acc73ba39f0e96434b77)) by @tuner

### Features

* **app-agent:** add intent action type docs tool ([#376](https://github.com/genome-spy/genome-spy/issues/376)) ([10943f8](https://github.com/genome-spy/genome-spy/commit/10943f8afbde25935fdf2c703624154dbb14c91c)) by @tuner
* **app-agent:** characterize sample attribute plots ([#371](https://github.com/genome-spy/genome-spy/issues/371)) ([ba35669](https://github.com/genome-spy/genome-spy/commit/ba3566955641ccceeb028423107741e3c91b2002)) by @tuner
* **app-agent:** clarify selection aggregation summaries ([#373](https://github.com/genome-spy/genome-spy/issues/373)) ([f2c4d2c](https://github.com/genome-spy/genome-spy/commit/f2c4d2c980f5dc74bf04751cf452950b192dc506)) by @tuner
* **app-agent:** dock agent chat panel ([#379](https://github.com/genome-spy/genome-spy/issues/379)) ([479b120](https://github.com/genome-spy/genome-spy/commit/479b120f74c66f4558f8ad679c7a32422e7abc33)) by @tuner
* **app:** add metadata semantic types ([a05dee1](https://github.com/genome-spy/genome-spy/commit/a05dee16a010f8865f4351cb0905ca289dd5d34d)) by @tuner
* **app:** derive metadata from feature-filtered interval aggregation ([#375](https://github.com/genome-spy/genome-spy/issues/375)) ([e778f4c](https://github.com/genome-spy/genome-spy/commit/e778f4cba92b68e9920a9f55519db78eced58e1d)) by @tuner
* **app:** introduce experimental app-agent ([#368](https://github.com/genome-spy/genome-spy/issues/368)) ([429acd7](https://github.com/genome-spy/genome-spy/commit/429acd717ab35881231f9bd3d034bccbba4c9eaa)) by @tuner
* **app:** retain categories by attribute condition ([#374](https://github.com/genome-spy/genome-spy/issues/374)) ([8446168](https://github.com/genome-spy/genome-spy/commit/844616822fb05f56d10f374a160365fabbf43f3a)) by @tuner
* **app:** support custom threshold group titles ([93884c8](https://github.com/genome-spy/genome-spy/commit/93884c8dbc1e7d269551f7659805844406702c37)) by @tuner
