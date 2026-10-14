#!/usr/bin/env bash
set -euo pipefail
mkdir -p src
cat > package.json <<'J'
{ "name": "catalog", "private": true, "dependencies": { "react": "^19.0.0", "react-dom": "^19.0.0" }, "devDependencies": { "vite": "^7.0.0", "typescript": "^5.6.0" } }
J
cat > src/ProductList.tsx <<'J'
import { useState } from 'react';

type Product = { id: string; name: string; price: number; tags: string[] };

function ProductRow({ product, onSelect }: { product: Product; onSelect: (id: string) => void }) {
  return (
    <li onClick={() => onSelect(product.id)}>
      {product.name} - ${product.price.toFixed(2)} [{product.tags.join(', ')}]
    </li>
  );
}

export function ProductList({ products }: { products: Product[] }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const visible = products
    .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" />
      <p>{visible.length} results{selected ? `, selected ${selected}` : ''}</p>
      <ul>
        {visible.map((p) => (
          <ProductRow key={p.id} product={p} onSelect={setSelected} />
        ))}
      </ul>
    </section>
  );
}
J
