# Color System & Palette

## Primary Gradient
```css
background: linear-gradient(135deg, #0a0e1a 0%, #1a1f2e 100%);
```

## Accent Colors (Use in overlays and highlights)

| Color | Hex | Use Case |
|-------|-----|----------|
| Purple | #8b5cf6 | Primary interactive, card borders, title glows |
| Blue | #5b21b6 | Secondary actions, highlights |
| Green | #22c55e | Success messages, positive actions |
| Amber | #fbbf24 | Warnings, caution messages |
| Red | #ef4444 | Errors, critical alerts |

## Opacity Rules

| Use | Opacity | Pattern |
|-----|---------|---------|
| Semi-transparent overlay | 50% (0.5) | `rgba(R,G,B,0.5)` for modal backgrounds |
| Gradient start | 15% (0.15) | `rgba(R,G,B,0.15)` for light gradient backgrounds |
| Gradient end | 10% (0.1) | `rgba(R,G,B,0.1)` for gradient fade |
| Border color | 30% (0.3) | `rgba(R,G,B,0.3)` for subtle borders |
| Glow effect | 50% (0.5) | `rgba(R,G,B,0.5)` for box-shadow/text-shadow glows |
| Dark glow | 20-40% (0.2-0.4) | For dimmer interactive states |

## Example: Purple-themed Card

```css
/* Container */
background: linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(139, 92, 246, 0.1) 100%);
border: 1.5px solid rgba(139, 92, 246, 0.3);
border-radius: 14px;

/* Text glow */
text-shadow: 0 0 20px rgba(139, 92, 246, 0.5);

/* Interactive glow */
box-shadow: 0 0 40px rgba(139, 92, 246, 0.5);
```

## Backdrop Effects

```css
/* Blur background behind modal/overlay */
backdrop-filter: blur(10px);

/* Semi-transparent dark overlay */
background-color: rgba(0, 0, 0, 0.5);
```

## Text Colors

- Primary text: #f8f8f8 (off-white)
- Secondary text: #d1d5db (light gray)
- Muted text: #9ca3af (medium gray)

## No Custom Colors Without Review

If design requires a color not in this palette:
1. Document the use case
2. Get approval from design lead
3. Add to this reference and update all similar components
