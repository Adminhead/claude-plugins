#!/usr/bin/env bash
set -euo pipefail
mkdir -p src
cat > package.json <<'J'
{
  "name": "orders-report",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=18.17 <20"
  },
  "scripts": {
    "test": "node --test"
  }
}
J
printf '18.20.4\n' > .nvmrc
cat > Dockerfile <<'J'
FROM node:18.20-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
CMD ["node", "src/sample-orders.mjs"]
J
cat > src/sample-orders.mjs <<'J'
export const orders = [
  { id: 'o-1001', customer: 'Brightwell Bakery', total: 240.5 },
  { id: 'o-1002', customer: 'Harrow & Finch', total: 87 },
  { id: 'o-1003', customer: 'Brightwell Bakery', total: 19.99 },
  { id: 'o-1004', customer: 'Quill Street Books', total: 410 },
  { id: 'o-1005', customer: 'Harrow & Finch', total: 132.25 },
]
J
