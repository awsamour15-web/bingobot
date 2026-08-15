# Animation Keyframes Library

Use these standard animations for consistency. Duration: 300-500ms recommended.

## Slide In (Entrance)

```css
@keyframes slideIn {
  0% {
    opacity: 0;
    transform: translateX(-20px);
  }
  100% {
    opacity: 1;
    transform: translateX(0);
  }
}

/* Usage */
.animated-element {
  animation: slideIn 0.4s ease-out forwards;
}
```

**When to use**: Modal/panel entrance, card reveal, message appearance.

---

## Scale In (Growth Entrance)

```css
@keyframes scaleIn {
  0% {
    opacity: 0;
    transform: scale(0.9);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

/* Usage */
.modal-content {
  animation: scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
```

**When to use**: Pop-up, expanded menu, enlarged element reveal.

---

## Bounce (Emphasis)

```css
@keyframes bounce {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.1);
  }
}

/* Usage */
.interactive-button:active {
  animation: bounce 0.3s ease-in-out;
}

/* Or for continuous bounce */
.celebrating-badge {
  animation: bounce 0.4s ease-in-out infinite;
}
```

**When to use**: Button press feedback, celebration/win effects, attention-grabbing.

---

## Pulse (Breathing)

```css
@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

/* Usage */
.loading-indicator {
  animation: pulse 1.5s ease-in-out infinite;
}

.notification-badge {
  animation: pulse 2s ease-in-out infinite;
}
```

**When to use**: Loading states, notifications, status indicators.

---

## Spin (Rotation)

```css
@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* Usage */
.loading-spinner {
  animation: spin 1s linear infinite;
}

/* Reverse spin */
.spin-reverse {
  animation: spin 1s linear infinite reverse;
}
```

**When to use**: Loading spinners, rotating icons, persistent loaders.

---

## Fade In/Out

```css
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes fadeOut {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

/* Usage */
.fade-in {
  animation: fadeIn 0.6s ease-in forwards;
}

.fade-out {
  animation: fadeOut 0.6s ease-out forwards;
}
```

**When to use**: Screen transitions, element removal, soft visibility changes.

---

## Slide Up (Y-axis entrance)

```css
@keyframes slideUp {
  0% {
    opacity: 0;
    transform: translateY(20px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Usage */
.bottom-sheet-content {
  animation: slideUp 0.4s ease-out forwards;
}
```

**When to use**: Bottom sheet reveal, floating action menu, card list entrance.

---

## Shake (Error/Warning)

```css
@keyframes shake {
  0%, 100% {
    transform: translateX(0);
  }
  10%, 30%, 50%, 70%, 90% {
    transform: translateX(-5px);
  }
  20%, 40%, 60%, 80% {
    transform: translateX(5px);
  }
}

/* Usage */
.error-alert {
  animation: shake 0.5s ease-in-out;
}
```

**When to use**: Error messages, invalid input feedback, warning alerts.

---

## Glow Pulse (Interactive Highlight)

```css
@keyframes glowPulse {
  0%, 100% {
    box-shadow: 0 0 20px rgba(139, 92, 246, 0.5);
  }
  50% {
    box-shadow: 0 0 40px rgba(139, 92, 246, 0.8);
  }
}

/* Usage */
.interactive-element:focus {
  animation: glowPulse 1.5s ease-in-out infinite;
}
```

**When to use**: Focus states, keyboard navigation highlights, accessibility focus ring.

---

## Timing & Easing Functions

### Recommended Durations

| Interaction | Duration | Easing |
|-------------|----------|--------|
| Micro (hover, focus) | 0.2s | ease-out, linear |
| Standard (modal, card) | 0.3-0.4s | ease-out |
| Entrance (page load) | 0.4-0.5s | ease-out |
| Bounce/celebrate | 0.3s | ease-in-out |
| Continuous (spinner) | 1-1.5s | linear |
| Fade/transition | 0.5-0.6s | ease-in-out |

### Easing Presets

```css
/* Fast entrance */
animation: slideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;

/* Smooth & natural */
animation: scaleIn 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;

/* Linear spinning */
animation: spin 1s linear infinite;

/* Bouncy overshoot */
animation: bounce 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
```

---

## Combining Multiple Animations

```css
.interactive-card {
  animation: slideIn 0.4s ease-out forwards,
             glowPulse 1.5s ease-in-out 0.4s infinite;
  /* Slides in first, then glow pulse starts after 0.4s */
}
```

---

## Performance Notes

- **CSS animations**: GPU-accelerated (use `transform` and `opacity`)
- **Avoid**: Animating layout properties (width, height, top, left) → causes reflow
- **Best transforms**: `scale()`, `rotate()`, `translateX/Y()`, `opacity`
- **Mobile**: Test on real devices; reduce animation count on low-end hardware

---

## Quick Reference: Animation by Use Case

| Use Case | Animation | Duration |
|----------|-----------|----------|
| Button press | bounce | 0.3s |
| Modal open | scaleIn | 0.3s |
| Screen enter | slideIn | 0.4s |
| Loading spinner | spin | 1s |
| Notification badge | pulse | 2s |
| Error message | shake | 0.5s |
| Card hover | (none - use transition: all 0.3s ease) | — |
| Focus highlight | glowPulse | 1.5s |
| List item enter | slideUp | 0.4s |
