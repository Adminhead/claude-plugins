#!/usr/bin/env bash
set -euo pipefail
cat > product.html <<'J'
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Alder Desk Lamp</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, sans-serif; line-height: 1.5; color: #1d2733; }
    header { padding: 1rem 1.5rem; background: #1d2733; color: #fff; }
    main { max-width: 64rem; margin: 0 auto; padding: 1.5rem; }
    .summary { display: flex; gap: 2rem; align-items: flex-start; }
    .summary img { width: 20rem; height: 20rem; background: #e3e8ee; flex: none; }
    .summary .info { flex: 1; }
    .sku-row { display: flex; gap: 1rem; align-items: center; }
    .sku-row .label { flex: none; font-weight: 600; }
    .sku-row .sku { font-family: ui-monospace, monospace; white-space: nowrap; }
    .specs { width: 840px; border-collapse: collapse; margin-top: 2rem; }
    .specs th, .specs td { border: 1px solid #c9d1da; padding: 0.5rem 0.75rem; text-align: left; }
    footer { padding: 1.5rem; color: #5b6775; }
  </style>
</head>
<body>
  <header><strong>Hartwell Home</strong></header>
  <main>
    <h1>Alder Desk Lamp</h1>
    <section class="summary">
      <img alt="Alder desk lamp, oak base with a brass arm" width="320" height="320">
      <div class="info">
        <p>Dimmable LED lamp with an oak base and a brass arm that reaches 52 cm.</p>
        <div class="sku-row">
          <span class="label">Item code</span>
          <span class="sku">HH-ALDER-LAMP-OAK-BRASS-52CM-WARMWHITE-2700K-EU-PLUG-V3</span>
        </div>
        <p><button type="button">Add to basket</button></p>
      </div>
    </section>
    <table class="specs">
      <caption>Specifications</caption>
      <thead><tr><th>Property</th><th>Value</th><th>Notes</th></tr></thead>
      <tbody>
        <tr><td>Light output</td><td>800 lm</td><td>Dimmable down to 5 percent</td></tr>
        <tr><td>Colour temperature</td><td>2700 K</td><td>Warm white</td></tr>
        <tr><td>Power</td><td>9 W</td><td>Mains, 1.8 m cable</td></tr>
        <tr><td>Arm reach</td><td>52 cm</td><td>Two joints, brass finish</td></tr>
      </tbody>
    </table>
  </main>
  <footer>Hartwell Home, 14 Ferry Lane</footer>
</body>
</html>
J
