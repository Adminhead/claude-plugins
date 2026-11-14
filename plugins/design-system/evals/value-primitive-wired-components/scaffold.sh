#!/usr/bin/env bash
set -euo pipefail
mkdir -p src/styles src/components
cat > package.json <<'J'
{
  "name": "console-ui",
  "private": true,
  "dependencies": {
    "react": "18.2.0",
    "react-dom": "18.2.0"
  }
}
J
cat > src/styles/tokens.css <<'J'
:root {
  /* palette */
  --white: #ffffff;
  --gray-50: #f9fafb;
  --gray-200: #eaecf0;
  --gray-300: #d0d5dd;
  --gray-500: #667085;
  --gray-900: #101828;
  --blue-500: #2e90fa;
  --blue-600: #1570ef;
  --blue-700: #175cd3;
  --red-500: #f04438;
  --red-600: #d92d20;
  --green-100: #d1fadf;
  --green-700: #027a48;

  /* spacing */
  --space-2: 8px;
  --space-4: 16px;
  --space-6: 24px;

  /* roles */
  --color-bg-surface: var(--gray-50);
  --color-text-primary: var(--gray-900);
  --color-text-muted: var(--gray-500);
  --color-text-danger: var(--red-600);
  --color-action-primary: var(--blue-600);
  --color-action-primary-hover: var(--blue-700);
  --color-feedback-danger: var(--red-600);
  --color-feedback-success-bg: var(--green-100);
  --color-feedback-success-text: var(--green-700);
  --color-border-default: var(--gray-300);
  --color-border-focus: var(--blue-500);
}
J
cat > src/components/Button.css <<'J'
.btn { padding: var(--space-2) var(--space-4); border-radius: 6px; border: 0; }
.btn-primary { background: var(--blue-600); color: var(--white); }
.btn-primary:hover { background: var(--blue-700); }
.btn-danger { background: var(--red-600); color: var(--white); }
.btn-danger:hover { background: var(--red-500); }
.btn-secondary { background: var(--white); color: var(--gray-900); border: 1px solid var(--gray-300); }
J
cat > src/components/Input.css <<'J'
.input { border: 1px solid var(--gray-300); color: var(--gray-900); padding: var(--space-2); }
.input:focus { border-color: var(--blue-500); }
.input.error { border-color: var(--red-600); }
.input-hint { color: var(--gray-500); }
.input-error-text { color: var(--red-600); }
J
cat > src/components/Badge.css <<'J'
.badge { padding: 2px var(--space-2); border-radius: 999px; }
.badge-success { background: var(--green-100); color: var(--green-700); }
.badge-danger { background: var(--red-600); color: var(--white); }
.badge-info { background: var(--blue-500); color: var(--white); }
J
cat > src/components/Alert.css <<'J'
.alert { padding: var(--space-4); background: var(--gray-50); }
.alert-error { border-left: 4px solid var(--red-600); color: var(--gray-900); }
.alert-info { border-left: 4px solid var(--blue-500); color: var(--gray-900); }
.alert-title { color: var(--gray-900); }
J
cat > src/components/Card.css <<'J'
.card {
  background: var(--gray-50);
  border: 1px solid var(--gray-200);
  padding: var(--space-4);
}
.card-meta { color: var(--gray-500); }
J
