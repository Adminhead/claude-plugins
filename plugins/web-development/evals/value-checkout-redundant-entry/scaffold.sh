#!/usr/bin/env bash
set -euo pipefail
cat > shipping.html <<'J'
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Checkout - shipping</title>
</head>
<body>
  <main>
    <h1>Shipping</h1>
    <form id="shipping" autocomplete="on">
      <label>Full name <input name="fullName" autocomplete="name" required></label>
      <label>Address line 1 <input name="line1" autocomplete="address-line1" required></label>
      <label>Address line 2 <input name="line2" autocomplete="address-line2"></label>
      <label>City <input name="city" autocomplete="address-level2" required></label>
      <label>Postcode <input name="postcode" autocomplete="postal-code" required></label>
      <label>Country <input name="country" autocomplete="country-name" required></label>
      <button type="submit">Continue to payment</button>
    </form>
  </main>
  <script>
    document.getElementById('shipping').addEventListener('submit', function (e) {
      e.preventDefault()
      var data = Object.fromEntries(new FormData(e.target))
      sessionStorage.setItem('checkout.shipping', JSON.stringify(data))
      location.href = 'payment.html'
    })
  </script>
</body>
</html>
J
