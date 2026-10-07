# Content sources — P0 seed

Records the actual, verified provenance of every media asset used in the P0 seed
dataset (`seed/content/dataset.json`, `seed/assets-manifest.json`). All five images
were sourced from Pexels under the Pexels License, downloaded by
`seed/prepare_assets.py`, verified byte-for-byte via SHA-256 at download and at
Cloudinary delivery time, and uploaded to the owner's Cloudinary account under the
`jelajah-lokal/seed/` public-ID namespace. No other folders or pre-existing assets
were touched by the upload run.

Cloudinary account: cloud name `dbuganxsj` (from the private root `.env`,
`CLOUDINARY_CLOUD_NAME`). Upload run completed `2026-10-07T08:42:58Z`
(`seed/assets-manifest.json` → `preparedAt`).

## Pexels License terms (applies to all five images)

Pexels License (https://www.pexels.com/license/): free to use, no attribution
legally required, modification permitted; photos/videos may not be sold unmodified,
redistributed as a competing stock service, or used to imply endorsement of a
product/person depicted. Attribution is given below anyway as editorial good
practice.

## Assets

| Pexels photo ID | Photographer | License | Source page | Cloudinary public ID | Verified (checkedAt) |
| --- | --- | --- | --- | --- | --- |
| 36810327 | Tom Fisk | Pexels License | https://www.pexels.com/photo/stunning-aerial-view-of-bali-s-terraced-rice-fields-36810327/ | `jelajah-lokal/seed/pexels-36810327` | 2026-10-07T08:42:51.047710Z |
| 37121687 | Noval Gani | Pexels License | https://www.pexels.com/photo/authentic-indonesian-street-food-satay-37121687/ | `jelajah-lokal/seed/pexels-37121687` | 2026-10-07T08:42:52.949026Z |
| 28881743 | TIORHISTA R | Pexels License | https://www.pexels.com/photo/traditional-village-houses-with-thatch-roofs-28881743/ | `jelajah-lokal/seed/pexels-28881743` | 2026-10-07T08:42:55.123792Z |
| 1846335 | Tom Fisk | Pexels License | https://www.pexels.com/photo/view-of-rice-fields-1846335/ | `jelajah-lokal/seed/pexels-1846335` | 2026-10-07T08:42:56.877896Z |
| 1547429 | Tom Fisk | Pexels License | https://www.pexels.com/photo/drone-footage-of-village-near-cropland-1547429/ | `jelajah-lokal/seed/pexels-1547429` | 2026-10-07T08:42:58.739774Z |

## Access and verification method

`seed/prepare_assets.py`:

1. Parses the five approved Pexels photo URLs out of the frozen HTML sources
   embedded in the script (`approved_urls()`); no other photo IDs are in scope.
2. Downloads each image over HTTPS from `images.pexels.com`, computes its SHA-256,
   width, height, and format from the actual bytes (Pillow), and enforces a 5 MB
   cap.
3. Uploads the verified bytes to Cloudinary under
   `jelajah-lokal/seed/pexels-<photoId>`, tagged with `context.custom` metadata
   (`application=jelajah-lokal`, `seedIdentity=jelajah-lokal-p0-v1`,
   `sourcePhotoId=<id>`) so re-runs can detect and refuse to overwrite
   differently-owned resources (`check_owned()`).
4. Re-downloads the resulting Cloudinary delivery URL, recomputes its SHA-256, and
   records the match against the pre-upload hash as proof of integrity
   (`proof.retrievedSha256` / `proof.uploadedSha256` / `proof.deliverySha256` in
   `seed/assets-manifest.json`).

All five `deliverySha256` values in the manifest match their corresponding
`uploadedSha256`, and every `secureUrl` resolves with HTTP 200 directly from
Cloudinary at the time of this report. Source/download URLs point at the
photographer's original Pexels listing page, not at any third-party mirror.

## Scope notes

- No stock video, audio, or AI-generated imagery is used in this seed.
- Images are illustrative only — each article explicitly states in its body copy
  that the photo is generic illustration, not documentation of a visited location,
  per `operationalClaims: false` in `seed/content/dataset.json`.
- `imageCredit` / `imageSourceUrl` fields in `dataset.json` for each article match
  the photographer/source-page pairs in the table above.
