# Bonus Page Testing Guide

## Pre-Testing Setup

### 1. Start the Admin Panel
```bash
cd apps/admin
npm run dev
```

### 2. Access the Application
- Open browser: `http://localhost:5173` (or configured port)
- Login with admin credentials

### 3. Navigate to Bonus Page
- Click "Bonus Manager" in the sidebar
- Verify the "⭐ Active Bonuses" tab is selected by default

## Test Cases

### Test Case 1: View Active Bonuses Tab
**Steps:**
1. Navigate to Bonus Manager page
2. Check that "Active Bonuses" tab is selected by default
3. Verify tab displays properly

**Expected Result:**
- Active Bonuses tab is selected (primary color)
- Other tabs are in outline style
- Page loads without errors

**Status:** [ ] Pass [ ] Fail

---

### Test Case 2: Empty State Display
**Prerequisite:** No bonuses exist in the system

**Steps:**
1. View Active Bonuses tab with no bonuses

**Expected Result:**
- Blue info alert appears
- Message: "No active bonuses found. Create a bonus promotion from the 'Bulk Bonus' tab."
- No errors in console

**Status:** [ ] Pass [ ] Fail

---

### Test Case 3: Create a Test Bonus
**Steps:**
1. Click "🎯 Bulk Bonus (Promotion)" tab
2. Click "+ New Bulk Bonus" button
3. Fill in:
   - Title: "Test Welcome Bonus"
   - Amount: 25
   - Wallet: Play
4. Click "Create Bonus Promotion"

**Expected Result:**
- Success message appears
- New bonus is created
- System returns to existing promotions list

**Status:** [ ] Pass [ ] Fail

---

### Test Case 4: View Bonus in Active Bonuses Tab
**Steps:**
1. Return to "⭐ Active Bonuses" tab
2. Verify the created bonus appears

**Expected Result:**
- Table displays with 5 columns
- Bonus shows:
  - Title: "Test Welcome Bonus"
  - Amount: "25.00 ETB"
  - Wallet: "play" badge
  - Status: "active" badge (green)
  - Actions: [Edit] [Deactivate] buttons

**Status:** [ ] Pass [ ] Fail

---

### Test Case 5: Edit Bonus - Enter Edit Mode
**Steps:**
1. Click [Edit] button on the test bonus
2. Observe the row transformation

**Expected Result:**
- Amount field becomes an editable number input
- Wallet becomes a dropdown with "Play" and "Main" options
- Action buttons change to [Save] [Cancel]
- No errors in console

**Status:** [ ] Pass [ ] Fail

---

### Test Case 6: Edit Bonus - Change Amount
**Steps:**
1. Enter edit mode
2. Change amount from 25 to 30
3. Click [Save]

**Expected Result:**
- "Saving…" text appears briefly
- Success message: "Bonus updated successfully."
- Amount updates to "30.00 ETB"
- Row exits edit mode
- Refresh icon spins briefly

**Status:** [ ] Pass [ ] Fail

---

### Test Case 7: Edit Bonus - Change Wallet
**Steps:**
1. Click [Edit] on the bonus
2. Change wallet from "Play" to "Main"
3. Click [Save]

**Expected Result:**
- Success message appears
- Wallet badge changes to "main"
- Changes persist after page refresh

**Status:** [ ] Pass [ ] Fail

---

### Test Case 8: Edit Bonus - Cancel Changes
**Steps:**
1. Click [Edit]
2. Change amount to 999
3. Click [Cancel] (don't save)

**Expected Result:**
- Row exits edit mode
- Amount reverts to original value
- No API call is made
- No success/error messages

**Status:** [ ] Pass [ ] Fail

---

### Test Case 9: Deactivate Bonus
**Steps:**
1. Find an active bonus
2. Click [Deactivate] button

**Expected Result:**
- Success message: "Bonus deactivated."
- Status badge changes to "inactive" (gray)
- Button changes to [Activate]
- Button color changes to primary/blue

**Status:** [ ] Pass [ ] Fail

---

### Test Case 10: Activate Bonus
**Steps:**
1. Find an inactive bonus
2. Click [Activate] button

**Expected Result:**
- Success message: "Bonus activated."
- Status badge changes to "active" (green)
- Button changes to [Deactivate]
- Button color changes to warning/yellow

**Status:** [ ] Pass [ ] Fail

---

### Test Case 11: Refresh Bonuses
**Steps:**
1. Click [↻ Refresh] button in card header

**Expected Result:**
- Loading indicator appears briefly
- Bonus list reloads from server
- All current bonuses display
- Current edits are discarded (if any)

**Status:** [ ] Pass [ ] Fail

---

### Test Case 12: Multiple Bonuses Display
**Prerequisite:** Create 3+ bonuses with different amounts

**Steps:**
1. View Active Bonuses tab with multiple bonuses

**Expected Result:**
- All bonuses display in table format
- Each row shows correct data
- Scrollable if many bonuses exist
- No layout issues or overlapping

**Status:** [ ] Pass [ ] Fail

---

### Test Case 13: Eligibility Criteria Count
**Prerequisite:** Create a bonus with criteria (e.g., minBalance, maxBalance)

**Steps:**
1. View bonus with criteria in Active Bonuses tab

**Expected Result:**
- Below bonus title, gray text shows: "X criteria" or "X criterion"
- Number matches actual criteria count
- Singular/plural grammar is correct

**Status:** [ ] Pass [ ] Fail

---

### Test Case 14: Error Handling - Invalid Amount
**Steps:**
1. Click [Edit]
2. Enter amount: -10 (negative)
3. Click [Save]

**Expected Result:**
- Browser validation prevents negative numbers
- Or backend returns error
- Error message displays in red alert
- Row stays in edit mode

**Status:** [ ] Pass [ ] Fail

---

### Test Case 15: Error Handling - Network Failure
**Steps:**
1. Disconnect from internet or stop backend
2. Try to edit a bonus
3. Click [Save]

**Expected Result:**
- Error message appears: "Failed to update bonus: [error details]"
- Row stays in edit mode
- User can retry after reconnecting

**Status:** [ ] Pass [ ] Fail

---

### Test Case 16: Concurrent Editing Prevention
**Steps:**
1. Open two browser tabs with same bonus page
2. Edit same bonus in both tabs
3. Save in first tab
4. Save in second tab

**Expected Result:**
- Second save succeeds (overwrites first)
- Or conflict detection message appears
- No data corruption

**Status:** [ ] Pass [ ] Fail

---

### Test Case 17: Tab Switching Persistence
**Steps:**
1. Click [Edit] on a bonus
2. Switch to "Single Player" tab
3. Return to "Active Bonuses" tab

**Expected Result:**
- Edit state is reset
- No bonus is in edit mode
- All data displays normally

**Status:** [ ] Pass [ ] Fail

---

### Test Case 18: Management Tips Section
**Steps:**
1. Scroll down to "💡 Bonus Management Tips" card

**Expected Result:**
- Card displays below main table
- 4 tips are visible:
  - Edit Bonus
  - Activate/Deactivate
  - Eligibility Criteria
  - Distribution History
- Text is readable and formatted

**Status:** [ ] Pass [ ] Fail

---

### Test Case 19: Only Bonus Promotions Display
**Steps:**
1. Create a regular promotion (no bonus_amount)
2. View Active Bonuses tab

**Expected Result:**
- Regular promotion does NOT appear
- Only promotions with bonus_amount > 0 display
- Filter works correctly

**Status:** [ ] Pass [ ] Fail

---

### Test Case 20: TypeScript and Console Errors
**Steps:**
1. Open browser DevTools console (F12)
2. Navigate through all bonus tab features
3. Perform edit, save, activate operations

**Expected Result:**
- No TypeScript errors
- No runtime errors in console
- No warning messages (except dev mode warnings)
- Network requests succeed (200 status)

**Status:** [ ] Pass [ ] Fail

---

## API Integration Tests

### API Test 1: GET /api/admin/promotions
**Steps:**
1. Open Network tab in DevTools
2. Load Active Bonuses tab
3. Check network request

**Expected Result:**
- GET request to `/api/admin/promotions`
- Status: 200 OK
- Response contains array of promotions
- Bonuses are filtered client-side

**Status:** [ ] Pass [ ] Fail

---

### API Test 2: PATCH /api/admin/promotions/:id
**Steps:**
1. Edit and save a bonus
2. Check network request

**Expected Result:**
- PATCH request to `/api/admin/promotions/{id}`
- Request body contains: `{ bonus_amount, bonus_wallet }`
- Status: 200 OK
- Response contains updated promotion

**Status:** [ ] Pass [ ] Fail

---

### API Test 3: PATCH /api/admin/promotions/:id/status
**Steps:**
1. Toggle bonus status
2. Check network request

**Expected Result:**
- PATCH request to `/api/admin/promotions/{id}/status`
- Request body: `{ status: "active" }` or `{ status: "inactive" }`
- Status: 200 OK

**Status:** [ ] Pass [ ] Fail

---

## Performance Tests

### Performance Test 1: Load Time
**Steps:**
1. Create 50+ bonuses
2. Measure tab load time

**Expected Result:**
- Page loads in < 2 seconds
- No lag or freezing
- Smooth scrolling

**Status:** [ ] Pass [ ] Fail

---

### Performance Test 2: Edit Responsiveness
**Steps:**
1. Click [Edit] button
2. Measure time to enter edit mode

**Expected Result:**
- Edit mode activates instantly (< 100ms)
- Input fields are immediately focusable
- No visual delay

**Status:** [ ] Pass [ ] Fail

---

## Browser Compatibility

Test on multiple browsers:
- [ ] Chrome/Edge (Chromium)
- [ ] Firefox
- [ ] Safari (if available)

All test cases should pass on all browsers.

---

## Regression Tests

Ensure existing features still work:
- [ ] Single Player bonus assignment works
- [ ] Bulk Bonus tab functions correctly
- [ ] Deposit Bonus settings save properly
- [ ] Other admin pages are unaffected

---

## Accessibility Tests

### A11y Test 1: Keyboard Navigation
**Steps:**
1. Use Tab key to navigate through table
2. Use Enter to activate buttons

**Expected Result:**
- All interactive elements are focusable
- Focus indicators are visible
- Buttons activate on Enter key

**Status:** [ ] Pass [ ] Fail

---

### A11y Test 2: Screen Reader Support
**Steps:**
1. Enable screen reader (NVDA/JAWS/VoiceOver)
2. Navigate through Active Bonuses tab

**Expected Result:**
- Table structure is announced
- Button purposes are clear
- Status changes are announced

**Status:** [ ] Pass [ ] Fail

---

## Test Summary

**Total Tests:** 25+
**Passed:** ___
**Failed:** ___
**Skipped:** ___

**Critical Issues:** ___
**Minor Issues:** ___

**Tested By:** _______________
**Date:** _______________
**Environment:** _______________

---

## Known Issues

Document any bugs found:
1. 
2. 
3. 

---

## Approval

**QA Approved:** [ ] Yes [ ] No
**Signature:** _______________
**Date:** _______________
