#!/usr/bin/env bash
set -euo pipefail
mkdir -p src/styles src/components
cat > package.json <<'J'
{
  "name": "inbox-web",
  "private": true,
  "dependencies": {
    "react": "18.2.0",
    "react-dom": "18.2.0"
  }
}
J
cat > src/styles/tokens.css <<'J'
:root {
  --space-s: 8px;
  --space-m: 16px;
  --space-l: 24px;

  --radius-s: 4px;
  --radius-m: 8px;

  --color-surface-sunken: #f5f7fa;
  --color-surface-raised: #ffffff;
  --color-text-primary: #101828;
  --color-text-muted: #667085;
  --color-action: #1f6feb;
  --color-action-hover: #1858bd;
  --color-border-subtle: #eaecf0;

  --text-title-size: 18px;
  --text-title-weight: 600;
  --text-body-size: 14px;
  --text-body-weight: 400;
}
J
cat > src/components/Avatar.tsx <<'J'
type AvatarProps = { src: string; name: string; size?: 'm' | 'l' }

export function Avatar({ src, name, size = 'm' }: AvatarProps) {
  return <img className={`avatar avatar-${size}`} src={src} alt={name} />
}
J
cat > src/components/Avatar.css <<'J'
.avatar { border-radius: 50%; object-fit: cover; }
.avatar-m { width: 40px; height: 40px; }
.avatar-l { width: 56px; height: 56px; }
J
cat > src/components/Card.css <<'J'
.card {
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-m);
  padding: var(--space-m);
}
J
