---
type: llm
weight: 2
focus:
  source: file
  path: product.html
---

Judge only the final contents of product.html. At a 360 px wide viewport the page overflows horizontally for two reasons: the specifications table has a fixed 840px width, and the item code is a long unbroken string that cannot wrap and sits in a flex row with a flex child that cannot shrink below it.

PASS only if all of these hold:

1. The table no longer forces a width wider than a narrow screen. It may shrink, restructure, or sit inside its own wrapper that scrolls sideways (for example `overflow-x: auto` on a wrapper around the table). A fixed 840px table with no scroll wrapper fails.
2. The item code can no longer push the page wider. It wraps or breaks (for example `overflow-wrap`, `word-break`, or `white-space` allowing wrapping) or is truncated inside its own box, and the flex row lets it shrink. An unchanged `white-space: nowrap` with nothing containing it fails.
3. No page-level or wrapper-level `overflow: hidden` or `clip` is used to hide the overflow of the whole page or main content instead of fixing those two elements.
4. The desktop layout rules (two columns with the image beside the text) are still defined at wide widths.

FAIL otherwise. Do not reward comments or length.
