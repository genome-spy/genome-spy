# Canonical msdfgen test oracle

The canonical development oracle is maintained separately in
[`genome-spy/msdfgen-oracle`](https://github.com/genome-spy/msdfgen-oracle).
Run `npm run fetch:msdf-oracle` to download the checksum-pinned `v0.1.0`
release into this directory. The downloaded module, manifest, and upstream
license are ignored by Git.

The oracle is used only by explicit comparison tests, scripts, and the
Storybook Path Points backend control. Production marks, ordinary unit tests,
package builds, and published files do not load or download it.
