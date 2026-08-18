# Active Bonuses Tab - User Interface Guide

## Overview
The new "Active Bonuses" tab provides a comprehensive CRUD interface for managing all active bonuses in the system.

## Tab Navigation

```
┌─────────────────────────────────────────────────────────────┐
│  Bonus Manager                                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [⭐ Active Bonuses] [👤 Single Player] [🎯 Bulk Bonus] ... │
│   └─ NEW TAB (Default)                                      │
└─────────────────────────────────────────────────────────────┘
```

## Main Table View

```
┌──────────────────────────────────────────────────────────────┐
│ Active Bonuses                            [↻ Refresh]        │
│ View and manage all active bonuses in the system            │
├─────────────┬─────────┬────────┬──────────┬─────────────────┤
│ Bonus Title │ Amount  │ Wallet │ Status   │ Actions         │
├─────────────┼─────────┼────────┼──────────┼─────────────────┤
│ Welcome     │ 20 ETB  │ play   │ ✅ active│ [Edit] [Deact.] │
│ Bonus       │         │        │          │                 │
│ 2 criteria  │         │        │          │                 │
├─────────────┼─────────┼────────┼──────────┼─────────────────┤
│ Deposit     │ 50 ETB  │ play   │ inactive │ [Edit] [Activ.] │
│ Boost       │         │        │          │                 │
├─────────────┼─────────┼────────┼──────────┼─────────────────┤
│ VIP Reward  │ 100 ETB │ main   │ ✅ active│ [Edit] [Deact.] │
│ 3 criteria  │         │        │          │                 │
└─────────────┴─────────┴────────┴──────────┴─────────────────┘
```

## Edit Mode

When you click "Edit", the row transforms to inline editing:

```
┌─────────────┬──────────────┬─────────────┬──────────┬────────────────┐
│ Bonus Title │ Amount       │ Wallet      │ Status   │ Actions        │
├─────────────┼──────────────┼─────────────┼──────────┼────────────────┤
│ Welcome     │ [___50___]   │ [Play ▼]    │ ✅ active│ [Save] [Cancel]│
│ Bonus       │ ↑ input      │ ↑ dropdown  │          │                │
└─────────────┴──────────────┴─────────────┴──────────┴────────────────┘
```

### Edit Mode Features:
- **Amount Input**: Number input field, minimum 1 ETB
- **Wallet Dropdown**: Choose between "Play" or "Main" wallet
- **Save Button**: Commits changes to database
- **Cancel Button**: Discards changes and returns to view mode

## Management Tips Section

```
┌──────────────────────────────────────────────────────────────┐
│ 💡 Bonus Management Tips                                     │
│ How to manage your bonus system effectively                 │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ • Edit Bonus: Click "Edit" to modify amount or wallet       │
│                                                              │
│ • Activate/Deactivate: Control bonus status without         │
│   deleting them                                             │
│                                                              │
│ • Eligibility Criteria: Edit criteria in "Bulk Bonus" tab   │
│                                                              │
│ • Distribution History: View recipients in "Bulk Bonus"     │
│   history section                                           │
└──────────────────────────────────────────────────────────────┘
```

## Status Indicators

**Active Bonus**
```
┌──────────┐
│ ✅ active │ ← Green badge
└──────────┘
```

**Inactive Bonus**
```
┌──────────┐
│ inactive │ ← Gray badge
└──────────┘
```

## User Workflows

### 1. View All Active Bonuses
```
Navigate to Bonus Manager → Active Bonuses tab (default)
→ See all bonuses with amounts, wallets, and status
```

### 2. Edit a Bonus Amount
```
1. Click [Edit] button on the bonus row
2. Change the amount in the input field
3. Optionally change the wallet dropdown
4. Click [Save] to commit changes
5. Success message appears
```

### 3. Deactivate a Bonus
```
1. Find the bonus with "✅ active" status
2. Click [Deactivate] button
3. Status changes to "inactive" (gray)
4. Bonus stops being distributed
```

### 4. Activate an Inactive Bonus
```
1. Find bonus with "inactive" status
2. Click [Activate] button
3. Status changes to "✅ active" (green)
4. Bonus resumes distribution
```

### 5. Refresh the List
```
Click [↻ Refresh] button in card header
→ Reloads all bonus data from server
```

## Empty State

When no bonuses exist:

```
┌──────────────────────────────────────────────────────────────┐
│ Active Bonuses                            [↻ Refresh]        │
│ View and manage all active bonuses in the system            │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ℹ️ No active bonuses found.                                 │
│     Create a bonus promotion from the "Bulk Bonus" tab.     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Error Handling

### Success Message
```
┌──────────────────────────────────────────────────────────────┐
│ ✅ Bonus updated successfully.                               │
└──────────────────────────────────────────────────────────────┘
```

### Error Message
```
┌──────────────────────────────────────────────────────────────┐
│ ❌ Failed to update bonus: Network error                     │
└──────────────────────────────────────────────────────────────┘
```

## Button States

### Normal State
- **Edit**: Blue outline button
- **Deactivate**: Yellow/warning button
- **Activate**: Blue/primary button

### During Save
- **Save**: Gray, shows "Saving…"
- **Cancel**: Disabled

### Loading State
```
┌──────────────────────────────────────────────────────────────┐
│ Active Bonuses                            [↻ Refresh]        │
├──────────────────────────────────────────────────────────────┤
│ Loading...                                                   │
└──────────────────────────────────────────────────────────────┘
```

## Column Descriptions

| Column | Description | Example Values |
|--------|-------------|----------------|
| **Bonus Title** | Name of the bonus promotion | "Welcome Bonus", "VIP Reward" |
| | Eligibility criteria count | "2 criteria", "3 criteria" |
| **Amount** | Bonus value in ETB | "20.00 ETB", "50.00 ETB" |
| **Wallet** | Target wallet type | "play", "main" |
| **Status** | Current activation state | "active", "inactive" |
| **Actions** | CRUD operation buttons | Edit, Save, Cancel, Activate, Deactivate |

## Integration Points

### With Bulk Bonus Tab
- Create new bonuses → Bulk Bonus tab
- Set eligibility criteria → Bulk Bonus tab
- View distribution history → Bulk Bonus tab

### With Backend API
- `GET /api/admin/promotions` - Load bonuses
- `PATCH /api/admin/promotions/:id` - Update bonus
- `PATCH /api/admin/promotions/:id/status` - Toggle status

## Best Practices

1. **Before Deactivating**: Check distribution history in Bulk Bonus tab
2. **After Editing**: Use the Refresh button to verify changes
3. **Test Changes**: Edit in small increments, save frequently
4. **Monitor Status**: Keep track of which bonuses are active
5. **Documentation**: Use descriptive titles for easy identification

## Keyboard Navigation

- **Tab**: Move between interactive elements
- **Enter**: Activate focused button
- **Escape**: Cancel edit mode (future enhancement)

## Responsive Design

The table layout adapts to screen size:
- Desktop: Full table with all columns
- Tablet: Condensed view with wrapping
- Mobile: Stacked card layout (future enhancement)

## Future Enhancements

Potential improvements:
- [ ] Bulk activate/deactivate multiple bonuses
- [ ] Search and filter bonuses
- [ ] Sort by amount, status, or title
- [ ] Duplicate bonus button
- [ ] Delete bonus with confirmation
- [ ] Inline criteria editing
- [ ] Export bonus list to CSV
