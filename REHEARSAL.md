# Attendance roster UI review

## Scope

The source is the existing attendance-roster application, rather than a copied fictional product. Applied Stageshow's still-frame principles: reduce repeated framing, strengthen hierarchy, keep realistic content, preserve the actual paper, align controls, and use a separate narrow-screen layout. No new demo, animation, cursor, or kit component was introduced; the gold-copy workflow and animation film gate are not applicable to this functioning app revision.

## Changes

- Compact introduction and a plain wordmark.
- Basic settings and names come before optional paper/template sections.
- Native keyboard-accessible details/summary for optional sections.
- File chooser remains keyboard accessible, opens its section on file selection, and uses one visible upload label.
- Readable mobile fields, a preview jump link, and reduced-motion support.
- Existing PDF drawing and mapping logic remains in place.

## Verification

- Chromium browser screenshots reviewed at 1440px and 390px.
- Horizontal overflow checked at 358, 390, 700, 768, 1024, and 1440px.
- Basic preview jump and sample-roster PDF download checked.
- Existing row selection tests: 3 passed.
- Existing browser regression: PDF/image upload, added column, drag/move/resize, typography, multipage PDF, validation, deletion, mapping, mobile touch, and no external requests passed. The test now opens the paper settings section and accepts BASE_URL.
- JavaScript syntax and git whitespace checks passed.

## Limits

Chromium was exercised in this environment. Safari/Firefox, physical printers, and screen-reader speech were not checked. The PDF's page geometry and output styling were not redesigned.
