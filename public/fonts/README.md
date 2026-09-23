# Noto Sans TC (Google Fonts)

The website uses Google's Noto Sans TC release for Traditional Chinese and Latin, with variable weights 100–900. It is self-hosted, including form controls and draft previews. `font-display: swap` keeps text visible during loading; unsupported glyphs fall back to generic sans-serif.

Source CSS: https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@100..900&display=swap (retrieved 2026-09-23 with a Chrome desktop user agent). Its `fonts.gstatic.com` v39 WOFF2 files are preserved unchanged locally. The 105 Unicode subsets total 4,194,768 bytes; browsers fetch only subsets needed by displayed text.

`noto-sans-tc/manifest.json` records each original URL, byte count and SHA-256. `src/styles/noto-sans-tc.css` retains Google's weight ranges and Unicode ranges, changing only URLs to local paths. Both CSS and font files are versioned so deployment needs no font download step or third-party runtime request.

License source: https://github.com/google/fonts/blob/3be1884c48c3e45b52ecc725676a08f87776373e/ofl/notosanstc/OFL.txt. The included [OFL.txt](OFL.txt) is unchanged. Its Adobe copyright notice is part of the upstream license; Noto CJK and Source Han Sans were jointly developed by Google and Adobe and released under different family names.

No paid font service or plan change is required. Cloudflare-managed Access pages and email templates are separate from the website.
