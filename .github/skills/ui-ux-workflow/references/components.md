# Component Style Patterns

## Card/Container Pattern

Used for content grouping, game info, player details, settings panels.

```css
.card {
  /* Layout */
  padding: 24px;
  border-radius: 14px;
  
  /* Background */
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(139, 92, 246, 0.1) 100%);
  
  /* Border */
  border: 1.5px solid rgba(139, 92, 246, 0.3);
  
  /* Depth */
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  
  /* Animation */
  transition: all 0.3s ease;
}

.card:hover {
  border-color: rgba(139, 92, 246, 0.6);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
}
```

**Color Variants**: Replace #8b5cf6 with #5b21b6 (blue), #22c55e (green), or #fbbf24 (amber) as needed.

---

## Badge Pattern

Used for high-impact interactive elements (buttons, status badges, action triggers).

### Large Badge (Interactive Action)
```css
.badge-large {
  /* Size */
  width: 72px;
  height: 72px;
  
  /* Shape */
  border-radius: 12px;
  
  /* Content */
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  
  /* Background & border */
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(139, 92, 246, 0.1) 100%);
  border: 1.5px solid rgba(139, 92, 246, 0.4);
  
  /* Glow effect */
  box-shadow: 0 0 40px rgba(139, 92, 246, 0.5);
  
  /* Animation */
  transition: all 0.3s ease;
  cursor: pointer;
}

.badge-large:hover {
  transform: scale(1.05);
  box-shadow: 0 0 60px rgba(139, 92, 246, 0.7);
}

.badge-large:active {
  transform: scale(0.95);
}
```

### Standard Button
```css
.button {
  /* Sizing */
  padding: 12px 16px;
  border-radius: 12px;
  
  /* Styling */
  border: none;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.3) 0%, rgba(139, 92, 246, 0.2) 100%);
  color: #f8f8f8;
  font-weight: 600;
  font-size: 14px;
  
  /* Interaction */
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.button:hover {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.5) 0%, rgba(139, 92, 246, 0.3) 100%);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}

.button:focus {
  outline: 2px solid rgba(139, 92, 246, 0.6);
  outline-offset: 2px;
}
```

---

## Typography Patterns

### Heading (Title)
```css
.heading {
  font-size: 48px;
  font-weight: 900;
  letter-spacing: 2px;
  color: #f8f8f8;
  text-shadow: 0 0 20px rgba(139, 92, 246, 0.5);
  line-height: 1.1;
  margin-bottom: 16px;
}
```

### Subheading
```css
.subheading {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #d1d5db;
  text-shadow: 0 0 12px rgba(139, 92, 246, 0.3);
  margin-bottom: 12px;
}
```

### Body Text
```css
.body {
  font-size: 16px;
  font-weight: 400;
  line-height: 1.6;
  color: #d1d5db;
  letter-spacing: 0.5px;
}

.body-small {
  font-size: 14px;
  font-weight: 500;
  color: #9ca3af;
}
```

---

## Alert/Message Patterns

### Success Message
```css
.alert-success {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(34, 197, 94, 0.1) 100%);
  border: 1.5px solid rgba(34, 197, 94, 0.4);
  color: #22c55e;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 0 20px rgba(34, 197, 94, 0.3);
}
```

### Error Message
```css
.alert-error {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(239, 68, 68, 0.1) 100%);
  border: 1.5px solid rgba(239, 68, 68, 0.4);
  color: #ef4444;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 0 20px rgba(239, 68, 68, 0.3);
}
```

### Warning Message
```css
.alert-warning {
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(251, 191, 36, 0.1) 100%);
  border: 1.5px solid rgba(251, 191, 36, 0.4);
  color: #fbbf24;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 0 20px rgba(251, 191, 36, 0.3);
}
```

---

## Grid/List Item Pattern

For displaying game grids, cartelas, player lists.

```css
.grid-item {
  /* Base styling */
  padding: 12px;
  border-radius: 8px;
  background: rgba(139, 92, 246, 0.08);
  border: 1px solid rgba(139, 92, 246, 0.2);
  
  /* Spacing */
  gap: 1-2px; /* Between grid items */
  
  /* Text */
  color: #f8f8f8;
  font-weight: 600;
  text-align: center;
  
  /* State */
  transition: all 0.2s ease;
}

.grid-item:hover {
  background: rgba(139, 92, 246, 0.15);
  border-color: rgba(139, 92, 246, 0.4);
}

.grid-item.active {
  background: rgba(139, 92, 246, 0.3);
  border-color: rgba(139, 92, 246, 0.6);
  box-shadow: 0 0 20px rgba(139, 92, 246, 0.4);
}

.grid-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  border-color: rgba(139, 92, 246, 0.1);
}
```

---

## Component Composition Example

```tsx
// CardComponent.tsx
import styles from './CardComponent.module.css';

export const CardComponent = ({ title, children }) => (
  <div className={styles.card}> {/* .card pattern */}
    <h2 className={styles.heading}>{title}</h2> {/* .heading pattern */}
    <div className={styles.body}>{children}</div> {/* .body pattern */}
  </div>
);
```

```css
/* CardComponent.module.css */
.card {
  padding: 24px;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(139, 92, 246, 0.1) 100%);
  border: 1.5px solid rgba(139, 92, 246, 0.3);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  transition: all 0.3s ease;
}

.heading {
  font-size: 28px;
  font-weight: 700;
  text-shadow: 0 0 15px rgba(139, 92, 246, 0.4);
  margin-bottom: 16px;
}

.body {
  font-size: 16px;
  color: #d1d5db;
  line-height: 1.6;
}
```

---

## When in Doubt

1. Card for grouped content → Use **Card Pattern**
2. Button-like interactive element → Use **Badge Pattern** (72px) or **Button Pattern** (12px padding)
3. Large title with emphasis → Use **Heading Pattern** with text-shadow
4. Status or alert → Use **Alert Pattern** for the color
5. Grid or list items → Use **Grid Item Pattern**

Ask design lead if pattern doesn't fit the use case.
