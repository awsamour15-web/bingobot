---
name: ui-ux-workflow
description: 'Build production-ready UI components following Fidel Bingo design standards. Use when: implementing new components, refining existing screens, ensuring visual consistency, or reviewing UI/UX work. Covers design review → implementation → quality verification.'
argument-hint: '[component-name] or [screen-name]'
user-invocable: true
---

# UI/UX Component Development Workflow

Complete workflow for building professional UI components using the established Fidel Bingo design system. Ensures visual consistency, performance, and quality across the mini-app and admin interfaces.

## When to Use

- Implementing new screens or components
- Redesigning existing UI elements
- Ensuring consistency with design standards
- Conducting UI/UX code reviews
- Verifying component bundle impact
- Team standardization on component patterns

## Design System Reference

All components should follow these standards (see [color system](./references/colors.md), [component patterns](./references/components.md), [animations](./references/animations.md)):

| Category | Standards |
|----------|-----------|
| **Colors** | Gradients (135deg), accent colors, 50% opacity overlays, backdrop blur |
| **Spacing** | 20-28px padding, 8-10px gaps, 12-16px margins |
| **Shadows** | `0 4px 12px rgba(0,0,0,0.2)` or glow effects `0 0 40px rgba(color,0.5)` |
| **Borders** | 1.5px solid with 30% opacity, 12-14px borderRadius |
| **Typography** | Titles: 38-48px/900 weight/2-3px letter-spacing; text-shadow glow |
| **Animations** | Bounce, slideIn, scaleIn, pulse, spin (200-500ms duration) |

## Workflow Steps

### Phase 1: Design Review & Planning

**Goal**: Validate design alignment with system before coding.

1. **Context Check**
   - What screen/component are you building? (e.g., "LiveGameScreen", "WinAlert")
   - Is this new, a redesign, or a variant?
   - What's the user interaction model?

2. **Design Validation** ✓ GATE
   - [ ] Does the design use colors from the established palette?
   - [ ] Are spacing values within system guidelines (20-28px, 8-10px, 12-16px)?
   - [ ] Do interactive elements use badge sizes (64-80px) or standard buttons (12-16px padding)?
   - [ ] Are animations listed (fade, slide, scale, bounce)? Match to keyframe library.
   - [ ] Performance: Will this component bundle reasonably? (typical: <10KB gzip per screen)
   - **Decision**: Proceed if ≥5/6 checks pass. Otherwise, request design refinement.

3. **Component Dependency Map**
   - Identify reusable sub-components (Card, Button, Badge, Alert)
   - Flag any new component types needed
   - Note external libraries (e.g., icons, animations)

---

### Phase 2: Implementation

**Goal**: Code components following patterns, with consistent application of design tokens.

#### 2a. Setup Component File

```typescript
// File: src/components/ComponentName.tsx
import React from 'react';
import styles from './ComponentName.module.css';

interface ComponentNameProps {
  // Define props with clear types
}

export const ComponentName: React.FC<ComponentNameProps> = ({ ... }) => {
  return (
    <div className={styles.container}>
      {/* Component JSX */}
    </div>
  );
};
```

#### 2b. Apply Design Tokens

Reference [component patterns](./references/components.md) for exact CSS values:

**Card Container Pattern**
```css
.card {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(139, 92, 246, 0.1) 100%);
  border: 1.5px solid rgba(139, 92, 246, 0.3);
  border-radius: 14px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  padding: 24px;
  transition: all 0.3s ease;
}
```

**Button/Badge Pattern** (for high-impact interactive elements)
```css
.badge {
  width: 72px;
  height: 72px;
  border-radius: 12px;
  box-shadow: 0 0 40px rgba(139, 92, 246, 0.5); /* Glow effect */
  padding: 12px;
  transition: all 0.3s ease;
}

.badge:hover {
  transform: scale(1.05);
  box-shadow: 0 0 60px rgba(139, 92, 246, 0.7);
}
```

**Text with Glow**
```css
.title {
  font-size: 48px;
  font-weight: 900;
  letter-spacing: 2px;
  text-shadow: 0 0 20px rgba(139, 92, 246, 0.5);
  color: #f8f8f8;
}
```

#### 2c. Implement Animations

Reference [animation keyframes](./references/animations.md):

```css
@keyframes slideIn {
  0% { opacity: 0; transform: translateX(-20px); }
  100% { opacity: 1; transform: translateX(0); }
}

@keyframes bounce {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

.animatedElement {
  animation: slideIn 0.4s ease-out forwards;
}

.interactiveButton:active {
  animation: bounce 0.3s ease-in-out;
}
```

#### 2d. Structure & Spacing

Apply consistent spacing using the grid:

```css
.section {
  padding: 24px; /* 20-28px range */
}

.elementGap {
  gap: 8px; /* 8-10px for element gaps */
}

.componentMargin {
  margin: 14px; /* 12-16px for component margins */
}
```

---

### Phase 3: Quality Verification

**Goal**: Ensure component meets standards before deployment.

#### 3a. Visual Checklist ✓ GATE

- [ ] **Colors**: All elements use system palette (no random hex colors)
- [ ] **Spacing**: Padding/margins/gaps match guidelines (±2px acceptable)
- [ ] **Shadows**: Cards have `0 4px 12px rgba(0,0,0,0.2)`; interactive elements have glow
- [ ] **Borders**: 1.5px solid with opacity 0.3; borderRadius 12-14px
- [ ] **Typography**: Large text has glow; hierarchy is clear (title > subtitle > detail)
- [ ] **Animations**: Smooth (300-500ms), appropriate to interaction (hover, focus, transition)
- [ ] **Responsive**: Tested at mobile (375px), tablet (768px), desktop (1440px) viewports
- [ ] **Accessibility**: Buttons clickable (≥48px min), contrast >4.5:1, alt text on images
- [ ] **Performance**: Component renders <100ms; no layout thrashing

#### 3b. Code Review

- [ ] CSS uses relative units (rem, %, em) not fixed px (except border-width)
- [ ] No inline styles; all styling in CSS modules or styled-components
- [ ] Component is reusable (props-driven, no hardcoded values)
- [ ] TypeScript types are strict (no `any`)
- [ ] Event handlers (onClick, onChange) are stable (useCallback for callbacks)
- [ ] No console errors or warnings

#### 3c. Bundle Impact

Check bundle size impact:

```bash
# Run from mini-app or admin directory
npm run build
# Compare output size (target: <10KB gzip per new component)
# If exceeds, consider:
#   - Code-splitting (dynamic imports)
#   - Removing unused dependencies
#   - Simplifying animations (CSS over JS)
```

#### 3d. Browser Testing

Test in:
- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (if on macOS)
- [ ] Mobile Safari (if targeting iOS)
- [ ] Animations smooth (60fps where possible)

---

### Phase 4: Documentation & Handoff

**Goal**: Enable teammates to use and maintain components.

1. **Component Documentation**
   ```tsx
   /**
    * @component ComponentName
    * Displays [function]. Uses design system colors/animations.
    * 
    * @example
    * <ComponentName prop1="value" onAction={handler} />
    * 
    * @param {string} prop1 - Description
    * @param {Function} onAction - Callback when action occurs
    */
   ```

2. **Design Token Reference** (if new pattern added)
   - Update [colors](./references/colors.md) or [components](./references/components.md) if component introduces new pattern
   - Document gradient values, shadow offsets, or animation timing

3. **Commit Message**
   ```
   feat: redesign ComponentName with professional styling
   
   - Applied system color palette (purple/blue gradients)
   - Added glow effects to interactive elements
   - Implemented slide-in and bounce animations
   - Bundle impact: +2.3KB gzip
   - Closes #123
   ```

---

## Decision Tree for Common Scenarios

**Scenario: Reusing an existing component style pattern**
→ Copy CSS from reference, adjust colors if needed, test responsiveness

**Scenario: Creating a new interactive element (button, badge, etc.)**
→ Use badge pattern (72px, glow), or button pattern (12-16px padding). Default to glow for emphasis.

**Scenario: Component exceeds 15KB gzip**
→ Evaluate: Can animations be CSS-only? Can sub-components be lazy-loaded? Remove unused styles.

**Scenario: Design deviates from system (uses non-standard color)**
→ Document why. If justified (brand requirement), add to color palette reference and update all similar components for consistency.

---

## Component Patterns Repository

For implementation details and copy-paste ready examples:

- [Color System](./references/colors.md)
- [Card, Button, Badge Patterns](./references/components.md)
- [Animation Keyframes Library](./references/animations.md)
- [Spacing Grid Standards](./references/spacing.md)
- [Completed Examples](./references/examples.md) (CartelaScreen, LiveGameScreen)

---

## Quick Command Reference

```bash
# Start development server (mini-app)
npm run dev

# Build and check bundle
npm run build

# Run TypeScript check
npm run type-check

# Lint code
npm run lint
```

---

## When to Escalate

- Design requires custom color not in palette
- Component interaction is complex (needs UX review)
- Bundle impact exceeds 15KB gzip
- Accessibility concerns (contrast, keyboard navigation)
- Cross-platform inconsistencies (iOS vs Android)

Contact design lead or team PM for guidance.
