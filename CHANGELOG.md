# Changelog

## 1.2.1

- Align the actual prompt bubble rather than its quotation/attachment container.
- Measure visible fixed headers instead of using a fixed 88px offset.
- Recheck the target after delayed layout shifts, DOM replacement and header resizing.
- Cancel correction on manual interaction; ensure rapid clicks select the latest target.

## 1.2.0

- Read all history pages and retain the active branch's prompts independently of virtual DOM rendering.
- Add 18px, 520px-wide scrollable hover previews.
- Locate prompts that are initially unmounted.

## 1.1.1

- Support the newer ChatGPT user-bubble and search-unit attributes.

## 1.1.0

- Introduce the minimal left-side prompt rail.
