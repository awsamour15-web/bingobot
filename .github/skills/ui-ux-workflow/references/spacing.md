# Spacing & Layout Standards

Consistent spacing creates visual rhythm and improves usability.

## Spacing Scale

| Purpose | Value | Use |
|---------|-------|-----|
| **Gutter** | 4px | Minimal gaps between compact elements |
| **Small gap** | 8px | Between related elements (icon + text) |
| **Medium gap** | 10px | Standard space between components |
| **Element margin** | 12-16px | Between component groups |
| **Section padding** | 20-28px | Inside cards, sections, containers |
| **Large margin** | 24-32px | Between major sections |
| **Screen padding** | 20px | Full-screen edge margins |

## Section/Container Padding

```css
/* Card or panel interior */
.card {
  padding: 24px; /* 20-28px range */
}

/* Tight card (smaller screen space) */
.card-compact {
  padding: 20px;
}

/* Large card or section */
.card-large {
  padding: 28px;
}

/* Screen-edge padding */
.screen {
  padding: 20px;
}
```

## Element Gaps (Flexbox/Grid)

```css
/* Between related items (icon + label) */
.flex-row {
  display: flex;
  gap: 8px; /* 8-10px for element gaps */
  align-items: center;
}

/* Between grouped components */
.component-group {
  display: flex;
  flex-direction: column;
  gap: 10px; /* 8-10px standard */
}

/* Grid items (cartela display) */
.grid {
  display: grid;
  gap: 1px; /* 1-2px between grid cells */
}
```

## Component Margins

```css
/* Between standalone components/cards */
.component {
  margin: 14px; /* 12-16px range */
}

/* Between form fields */
.form-group {
  margin-bottom: 16px;
}

/* Between sections */
.section {
  margin-top: 24px;
}
```

## Typography Spacing

```css
.heading {
  margin-bottom: 12px; /* Space after heading */
  margin-top: 0;
}

.subheading {
  margin-bottom: 10px;
  margin-top: 16px; /* Space before subheading */
}

.paragraph {
  margin-bottom: 12px;
  line-height: 1.6; /* Vertical rhythm */
}

/* Lists */
.list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.list-item {
  padding: 8px 0; /* Vertical spacing in lists */
  margin: 0;
}
```

## Button & Interactive Element Spacing

```css
/* Padding inside buttons */
.button {
  padding: 12px 16px; /* Vertical × Horizontal */
  border-radius: 12px;
}

/* Gap between multiple buttons */
.button-group {
  display: flex;
  gap: 10px; /* Space between buttons */
  justify-content: space-between;
}

/* Badge sizing with internal padding */
.badge {
  width: 72px;
  height: 72px;
  padding: 12px; /* Internal padding for icon/text */
  display: flex;
  align-items: center;
  justify-content: center;
}
```

## Responsive Spacing

```css
/* Mobile (375px viewport) */
@media (max-width: 640px) {
  .card {
    padding: 16px; /* Reduce to 16px on small screens */
  }
  
  .screen {
    padding: 16px;
  }
  
  .flex-row {
    gap: 6px; /* Tighter spacing on mobile */
  }
}

/* Tablet (768px) */
@media (min-width: 768px) {
  .card {
    padding: 24px; /* Standard 24px */
  }
}

/* Desktop (1024px+) */
@media (min-width: 1024px) {
  .card {
    padding: 28px; /* Generous 28px on large screens */
  }
}
```

## Card Layout Examples

### Vertical Stack
```css
.card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 24px;
}
```

Output:
```
┌─ Card ─────────────────────┐
│ [Header]                   │ (12px gap)
│ [Body content]             │ (12px gap)
│ [Button group]             │
└────────────────────────────┘
```

### Horizontal Layout
```css
.card {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 16px;
  padding: 24px;
}
```

Output:
```
┌─ Card ──────────────────────────────────┐
│ [Icon]  │ (16px) │ [Content info here] │
│ (small) │        │                     │
└──────────────────────────────────────────┘
```

## Grid Item Spacing

For game cartelas, player lists, number grids:

```css
.cartela-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 2px; /* 1-2px between cells */
  padding: 8px;
}

.cartela-item {
  width: 100%;
  aspect-ratio: 1;
  padding: 4px;
}
```

## Accessibility & Spacing

- **Minimum touch target**: 48px × 48px
- **Minimum click target**: 44px × 44px
- **Text spacing**: line-height ≥ 1.5 for body text
- **Visual separation**: Use space, borders, or background to distinguish sections

## When to Use Custom Spacing

Default to this scale. Only deviate if:
1. Component has unique interaction needs
2. Visual hierarchy requires emphasis
3. Mobile constraint requires different spacing
4. Approved by design lead

Document any custom spacing in component comments.

## Quick Reference Cheat Sheet

```
┌─────────────────────────────┐
│ 20px screen padding         │
│ ┌───────────────────────┐   │
│ │ 24px card padding     │   │
│ │ ┌─────────────────┐   │   │
│ │ │ Element 1       │   │   │
│ │ │ (12px margin)   │   │   │
│ │ ├─────────────────┤   │   │
│ │ │ Element 2       │   │   │
│ │ └─────────────────┘   │   │
│ └───────────────────────┘   │
│ 16px between cards          │
└─────────────────────────────┘
```
