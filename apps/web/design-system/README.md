# Vertex Connect Enterprise Design System

Welcome to the **Vertex Connect Enterprise Design System**. This package serves as the single source of truth for all visual styles, spacing grid patterns, typography layers, shadows, transitions, and reusable UI components across the web application workspace.

---

## Design Philosophy
Our visual language is designed to feel:
- **Minimal & Elegant** (inspired by Apple and Vercel)
- **High-Contrast & Usable** (inspired by Google Material 3 and WCAG AA standards)
- **Fluid & Responsive** (inspired by Stripe and Linear)

---

## Directory Structure

```
design-system/
├── tokens/
│   └── index.ts      <-- TypeScript variable key mappings
├── styles/
│   └── system.css    <-- Core CSS variables (Gray/Primary/Status HSL variables, typography class keys)
├── components/
│   ├── Button.tsx    <-- Custom Buttons variations
│   ├── Form.tsx      <-- Custom Input, Select, Textarea, Checkbox, Switch togglers
│   ├── Card.tsx      <-- Standard, elevated, analytics, glass wrappers
│   ├── Feedback.tsx  <-- Badges, Alerts, Progress Bars, Skeleton Shimmers, Toasts
│   └── Navigation.tsx <-- Sidebar items, breadcrumbs, SegmentedControls
├── animations/
│   └── transitions.ts <-- Motion and Framer motion variants
├── index.ts          <-- Unified exports index
└── README.md         <-- This developer manual
```

---

## 🚀 How to Import and Use Components

All components are exported from `@/design-system` entry file. Import them directly in any page:

```typescript
import { Button, Input, Card, Badge, SegmentedControl } from '@/design-system';
```

### 1. Button Usage
```tsx
import { Button } from '@/design-system';

// Variants: primary, secondary, outline, ghost, danger, success
// Sizes: sm, md, lg
<Button variant="primary" size="md" isLoading={false} leftIcon={<Icon name="plus" />}>
  Create Card
</Button>
```

### 2. Form Fields Usage
```tsx
import { Input, Select, Switch } from '@/design-system';

<Input 
  label="Profile URL Slug" 
  placeholder="jane-doe" 
  error={formError} 
  required 
/>

<Switch 
  label="Enable Live Visibility" 
  checked={isEnabled} 
  onChange={(e) => setEnabled(e.target.checked)} 
/>
```

### 3. Card Variations
```tsx
import { Card, CardHeader, CardBody, CardFooter } from '@/design-system';

// Variants: standard, elevated, analytics, glass, feature
<Card variant="elevated" hoverable>
  <CardHeader>
    <h3>Analytical Stats</h3>
  </CardHeader>
  <CardBody>
    <p>Real-time interactions display</p>
  </CardBody>
</Card>
```

### 4. Alerts & Badges
```tsx
import { Alert, Badge } from '@/design-system';

// Variants: success, warning, error, info
<Alert variant="success" title="Card Published" onClose={() => {}}>
  Your smart profile card is now live and scannable.
</Alert>

<Badge variant="success">Active</Badge>
```

---

## 🌓 Dark Theme & Theme Variables
The theme state is controlled by adding the `data-theme="dark"` attribute to any parent element (typically injected at `AppShell.tsx` level). 

All color tokens inside `system.css` adapt automatically. **Never hardcode hex values inside components**; instead, consume CSS custom properties:
- **Backgrounds**: `hsl(var(--ds-bg))`
- **Surface**: `hsl(var(--ds-surface))`
- **Borders**: `hsl(var(--ds-border))`
- **Typography**: `hsl(var(--ds-fg))` / `hsl(var(--ds-fg-muted))`
- **Accent**: `var(--ds-accent)`

---

## ♿ Accessibility & RTL Standards
1. **Focus Rings**: Standardised outlines are applied using `focus-visible:ring-2 focus-visible:ring-[var(--ds-accent)]` to ensure keyboard navigations highlight active fields.
2. **Contrast ratio**: HSL variables strictly follow WCAG AA guidelines (maintaining a minimum contrast of `4.5:1` for regular text).
3. **RTL Support**: Negative tracking is automatically reset for Arabic typography setups using CSS `[dir="rtl"]` wrappers to ensure supreme legibility.
