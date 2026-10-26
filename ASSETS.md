# Asset Provenance

Provenance record for the visual assets shipped in `Chatting_updated/public/`.
The goal is to know, for every file, where it came from and what licence applies,
so the project does not ship an unattributed third-party asset.

> **Status:** the files below are treated as original artwork created for
> ptr_29 Chat. The repository contains no third-party stock-asset licence,
> download record, or attribution file for them. If any asset was in fact
> sourced externally, add the source URL, author and licence here before further
> distribution. See [Reporting a gap](#reporting-a-gap).

---

## 1. Brand mark

The mark is a rounded chat bubble with a gradient fill and three dots. It exists
as hand-authored SVG and as raster exports of the same shape.

| File | Format | Role | Provenance | Licence |
|---|---|---|---|---|
| `favicon.svg` | SVG | Primary favicon | Hand-coded SVG in this repository; geometry and gradient are project-specific | © 2026 gamer-09, proprietary |
| `favicon.ico` | ICO | Legacy favicon | Raster export of the same mark | Same |
| `favicon-32.png` | PNG 32×32 | Small favicon | Raster export of the same mark | Same |
| `apple-touch-icon.png` | PNG 180×180 | iOS home-screen icon | Raster export of the same mark | Same |
| `icon-192.png` | PNG 192×192 | PWA icon | Raster export of the same mark | Same |
| `icon-512.png` | PNG 512×512 | PWA icon (maskable) | Raster export of the same mark | Same |

The same gradient bubble also appears inline as an SVG in
`index.html` and `client.js` (the `ptr29g` / `ptr29g2` gradients). It is the
project's own logo and is not a stock icon.

All raster icons were created on 2026-08-20; the SVG source is the canonical
version. To change the mark, edit the SVG first, then re-export the raster sizes
(32, 180, 192, 512) and update `site.webmanifest` if sizes change.

---

## 2. Glass backdrop imagery

| File | Format | Role | Provenance | Licence |
|---|---|---|---|---|
| `glass-backdrop-dark.jpg` | JPEG | Static first-paint background for the dark theme, behind the animated canvas and scrim | Project-specific image; no external source recorded | © 2026 gamer-09, proprietary |
| `glass-backdrop-light.jpg` | JPEG | Static first-paint background for the light theme | Project-specific image; no external source recorded | Same |

`glass-backdrop.js` renders animated waves on a `<canvas>` above the still
image. The script draws procedurally; it does not fetch a third-party image,
texture, shader, or font. The still images exist so the first paint is not an
empty canvas and so the page still looks intentional if motion is disabled or
`prefers-reduced-motion` is set.

If you replace these images:

1. Keep the same filenames, or update the CSS/JS references.
2. Keep the dimensions and aspect ratio compatible with the backdrop container.
3. Optimise the files (they are already under ~110 KB each) and record the
   source and licence in the table above.
4. Re-check contrast for text and controls rendered above the scrim in both
   themes.

---

## 3. Holiday and seasonal effects

`christmas.js`, `christmas-notice.js`, `halloween.js` and `halloween-notice.js`
draw their effects in JavaScript/canvas and use Unicode emoji. They do not ship
seasonal image files, fonts, or third-party sprites. Emoji glyphs are rendered
by the user's operating system, not bundled with the app.

---

## 4. Fonts and icons

- **Fonts:** none are bundled or downloaded. The app uses the system UI font
  stack (`system-ui`, `-apple-system`, `"Segoe UI"`, etc.).
- **Icons:** interface icons are Unicode emoji or inline SVG paths written for
  this project (send, reply, react, delete, search, theme, etc.). No icon-font
  or third-party icon pack is loaded.
- **Avatars:** default avatars are generated at runtime by the DiceBear API
  (see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)). They are not stored in
  the repository.

---

## 5. Screenshots and documentation images

`docs/chat-site-preview.png` is a screenshot of the running app used in the
repository README. It contains only the project's own UI and any demo content
visible at capture time. If it ever shows a real user's username, avatar, or
message, replace it with a synthetic/demo capture before publishing.

---

## 6. Rules for adding assets

- Prefer original SVG or CSS over downloaded images.
- Do not add an asset unless you can state its source and licence.
- Do not add stock images, icon packs, fonts, or textures whose licence forbids
  redistribution or requires attribution unless the attribution is added here.
- Do not add assets from a search engine, a random website, or an AI generator
  whose terms you have not checked.
- Keep filenames stable; GitHub Pages and the service worker cache them.
- Record the change in this file in the same commit as the asset.

---

## Reporting a gap

If you recognise an asset as third-party, or you are the rights holder and
believe something is used without permission, contact the operator privately via
the channels in [SECURITY.md](SECURITY.md) (or the
[Privacy Policy](https://gamer-09.github.io/chat-site/privacy.html#contact)).
Include the filename and, if possible, the original source. The asset will be
credited or removed.
