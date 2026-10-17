#!/usr/bin/env bash
set -euo pipefail
cat > release-please-config.json <<'J'
{ "packages": { ".": { "release-type": "node", "changelog-sections": [ { "type": "feat", "section": "Features" }, { "type": "fix", "section": "Bug Fixes" } ] } } }
J
cat > history.txt <<'J'
Fixed login stuff
update deps
Add retry to uploads.
wip
Fixed the thing with the cart
tweaks
Merge branch 'main' into fix-timeouts
J
cat > staged.diff <<'J'
diff --git a/src/cart.js b/src/cart.js
index 3b1c2aa..9f0d7e4 100644
--- a/src/cart.js
+++ b/src/cart.js
@@ -12,7 +12,10 @@ export function removeItem(cart, sku) {
-  return cart.items.filter((i) => i.sku !== sku);
+  const items = cart.items.filter((i) => i.sku !== sku);
+  // Removing the last item left a stale discount applied to an empty cart.
+  const discount = items.length === 0 ? 0 : cart.discount;
+  return { ...cart, items, discount };
 }
J
