# Noto Sans TC (Google Fonts)

The website uses Google's Noto Sans TC release for Traditional Chinese and Latin, with variable weights 100–900. It is self-hosted, including form controls and draft previews. `font-display: swap` keeps text visible during loading; unsupported glyphs fall back to generic sans-serif.

Source CSS: https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@100..900&display=swap (retrieved 2026-09-23 with a Chrome desktop user agent). Its `fonts.gstatic.com` v39 WOFF2 files are preserved unchanged locally. The 105 Unicode subsets total 4,194,768 bytes; browsers fetch only subsets needed by displayed text.

`noto-sans-tc/manifest.json` records each original URL, byte count and SHA-256. `src/styles/noto-sans-tc.css` retains Google's weight ranges and Unicode ranges, changing only URLs to local paths. Both CSS and font files are versioned so deployment needs no font download step or third-party runtime request.

License source: https://github.com/google/fonts/blob/3be1884c48c3e45b52ecc725676a08f87776373e/ofl/notosanstc/OFL.txt. The included [OFL.txt](OFL.txt) is unchanged. Its Adobe copyright notice is part of the upstream license; Noto CJK and Source Han Sans were jointly developed by Google and Adobe and released under different family names.

No paid font service or plan change is required. Cloudflare-managed Access pages and email templates are separate from the website.

# Instrument Sans

Latin text uses Instrument Sans, listed before Noto Sans TC in the font stack, so Traditional Chinese still renders in Noto Sans TC and Latin letters and punctuation no longer fall back to its Latin glyphs. The variable files cover weight 400–700 and width 75–100%.

The two WOFF2 files come unchanged from the npm package `@fontsource-variable/instrument-sans` 5.3.0 (`files/instrument-sans-latin-wdth-normal.woff2` and `files/instrument-sans-latin-ext-wdth-normal.woff2`, copied on 2026-11-17). They are committed here, so the package is not a dependency and no font is downloaded at build or run time.

| File                              | Bytes  | SHA-256                                                            |
| --------------------------------- | ------ | ------------------------------------------------------------------ |
| `instrument-sans/latin.woff2`     | 57,332 | `8b74e9bc6e415d564a5ffd32125c92ffd50b1635043e77543cb871e0a3cfcaf2` |
| `instrument-sans/latin-ext.woff2` | 18,856 | `f21fc6486d81d72d2f8c389ac41befccf199b9c02367ea8377368321cad3e779` |

`src/styles/instrument-sans.css` declares the two `@font-face` rules with the package's Unicode ranges. License: SIL Open Font License 1.1, in [instrument-sans/OFL.txt](instrument-sans/OFL.txt), copied from the package.
