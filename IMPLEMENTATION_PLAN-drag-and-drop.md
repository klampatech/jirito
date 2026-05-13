# Implementation Plan: Rework Drag & Drop to Match Jira-Style Spec

## Current State Assessment

The current drag-and-drop in `src/events.js` (`initDragDrop()`) **already works** — it supports:
- ✅ Dragging cards between columns (changes status)
- ✅ Reordering cards within the same column (uses floating-point `rank`)
- ✅ Drop indicator line (visually positioned via absolute CSS)
- ✅ Undo toast for every move/reorder
- ✅ `dragging` class with visual feedback
- ✅ Card preview under cursor (implicit via native drag)

**However**, it doesn't fully match the spec document's architecture:

| Spec Requirement | Current State | Gap |
|---|---|---|
| **Phase 1: Drag Start** — `setDragImage(card, offsetX, offsetY)` for custom preview | ❌ Missing | Uses browser default drag ghost |
| **Phase 2: Drag Over** — Track drop targets (not mouse), show indicator via `closestEdge` | ✅ Partial | Indicator works but uses `top`/absolute positioning instead of DOM insertion (`insertBefore`/`insertAfter`) |
| **Phase 3: Drop** — Splice source/dest arrays, update `columnId` + `index` | ✅ Partial | Uses floating-point `rank` instead of array splice-based insertion |
| **Data model** — Each card knows its `columnId` + `index` | ❌ Missing | Cards only have `rank` (float), no `columnId`/`index` tracking |
| **Empty column drops** — Empty space is a drop target | ✅ Partial | Indicator shows at bottom, but no explicit empty-target handling |
| **`drop-indicator` element** — Thin line inserted into DOM | ✅ Partial | Uses `position: absolute` + `top` instead of DOM insertion |
| **`drag-over` class on column-body** | ✅ Present | Works correctly |
| **CSS for `.drop-indicator`** | ❌ Missing | No CSS class defined |
| **`getClosestEdge()` helper** | ❌ Missing | Logic is inline, not extracted |
| **`getDestinationIndex()` helper** | ❌ Missing | Rank calculation is inline |

## Implementation Approach

Rather than rewriting from scratch, we **refactor** the existing `initDragDrop()` to:
1. Extract the spec's helper functions
2. Add `setDragImage` custom preview
3. Replace absolute-positioned indicator with DOM-inserted indicator
4. Add proper `columnId`/`index` tracking
5. Add CSS for `.drop-indicator`

---

## Task 1: Add CSS for `.drop-indicator`

**File:** `styles.css`

Add after the `.issue-card.dragging` rule (~line 611):

```css
/* Drop indicator — thin line showing where card will land */
.drop-indicator {
  height: 3px;
  background: var(--primary);
  border-radius: 2px;
  margin: 2px 0;
  transition: background 0.15s;
}
.column-body.drag-over .drop-indicator {
  background: var(--primary);
  box-shadow: 0 0 4px rgba(var(--primary-rgb), 0.4);
}
```

**Dark mode:** The `var(--primary)` already adapts to theme via CSS variables, so no extra dark-mode rule needed.

---

## Task 2: Extract Helper Functions

**File:** `src/events.js` (add near the top, before `initDragDrop`)

```js
// ===== Drag & Drop Helpers =====

function getClosestEdge(mouseY, rect) {
  const midpoint = rect.top + rect.height / 2;
  return mouseY < midpoint ? 'top' : 'bottom';
}

function getDestinationIndex({ sourceIndex, indexOfTarget, closestEdge }) {
  // If source and target are the same column and same card,
  // the user is hovering near the card itself — skip reordering
  if (sourceIndex === indexOfTarget) return -1;
  return closestEdge === 'top' ? indexOfTarget : indexOfTarget + 1;
}

function insertDropIndicator(col, targetCard, edge) {
  // Remove existing indicators
  col.querySelectorAll('.drop-indicator').forEach(el => el.remove());
  
  const indicator = document.createElement('div');
  indicator.className = 'drop-indicator';
  
  if (edge === 'top') {
    col.insertBefore(indicator, targetCard);
  } else {
    // Insert after targetCard
    const next = targetCard.nextElementSibling;
    if (next) {
      col.insertBefore(indicator, next);
    } else {
      col.appendChild(indicator);
    }
  }
}

function removeDropIndicators() {
  document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
}

function getCardPosition(cardEl) {
  const col = cardEl.closest('.column-body');
  const cards = [...col.querySelectorAll('.issue-card:not(.dragging)')];
  return {
    columnId: col.dataset.colId,
    index: cards.findIndex(c => c === cardEl)
  };
}
```

---

## Task 3: Refactor `initDragDrop()` — Phase 1: Drag Start

**File:** `src/events.js`

In the `dragstart` handler within `initDragDrop()`, add `setDragImage`:

```js
col.addEventListener('dragstart', e => {
  const card = e.target.closest('.issue-card');
  if (!card) return;
  
  draggedId = card.dataset.id;
  draggedCard = card;
  
  // Phase 1: Mark as dragging
  card.classList.add('dragging');
  
  // Phase 1: Store source position
  const pos = getCardPosition(card);
  draggedSource = pos;
  
  // Phase 1: Create custom drag image (card preview under cursor)
  const rect = card.getBoundingClientRect();
  e.dataTransfer.setDragImage(card, e.clientX - rect.left, e.clientY - rect.top);
  
  // Phase 1: Set drag data
  e.dataTransfer.setData('text/plain', String(card.dataset.id));
  e.dataTransfer.effectAllowed = 'move';
});
```

---

## Task 4: Refactor `initDragDrop()` — Phase 2: Drag Over

**File:** `src/events.js`

Replace the current `dragover` handler:

```js
col.addEventListener('dragover', e => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  col.classList.add('drag-over');
  
  // Find which card we're over
  const cards = [...col.querySelectorAll('.issue-card:not(.dragging)')];
  let targetCard = null;
  let closestEdge = null;
  
  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    const edge = getClosestEdge(e.clientY, rect);
    if (edge === 'top') {
      targetCard = card;
      closestEdge = edge;
      break;
    }
  }
  
  if (targetCard) {
    insertDropIndicator(col, targetCard, closestEdge);
    draggedTarget = { columnId: col.dataset.colId, index: cards.indexOf(targetCard), edge: closestEdge };
  } else {
    // Empty area or past last card — drop at bottom
    insertDropIndicator(col, cards[cards.length - 1] || null, 'bottom');
    draggedTarget = { columnId: col.dataset.colId, index: cards.length, edge: 'bottom' };
  }
});
```

---

## Task 5: Refactor `initDragDrop()` — Phase 3: Drop

**File:** `src/events.js`

Replace the current `drop` handler:

```js
col.addEventListener('drop', e => {
  e.preventDefault();
  col.classList.remove('drag-over');
  removeDropIndicators();
  
  const id = parseInt(e.dataTransfer.getData('text/plain'));
  const issue = getIssues().find(i => i.id === id);
  if (!issue) return;
  
  const colId = col.dataset.colId;
  const colDef = getEffectiveColumns().find(c => c.id === colId);
  const newStatus = colDef?.status || col.dataset.status;
  const oldStatus = issue.status;
  const sameColumn = colDef && colDef.status && issue.status === newStatus;
  
  // Calculate destination using the spec's logic
  const destIndex = getDestinationIndex({
    sourceIndex: draggedSource?.index ?? -1,
    indexOfTarget: draggedTarget?.index ?? -1,
    closestEdge: draggedTarget?.edge
  });
  
  const finalIndex = destIndex >= 0 ? destIndex : (draggedTarget?.index ?? -1) + 1;
  
  if (sameColumn) {
    // Reorder within same column — use floating-point rank for smooth insertion
    const beforeCards = [...col.querySelectorAll('.issue-card:not(.dragging)')].slice(0, finalIndex);
    const afterCards = [...col.querySelectorAll('.issue-card:not(.dragging)')].slice(finalIndex);
    
    const beforeIssue = beforeCards.length > 0 
      ? getIssues().find(i => i.id === parseInt(beforeCards[beforeCards.length - 1].dataset.id)) 
      : null;
    const afterIssue = afterCards.length > 0 
      ? getIssues().find(i => i.id === parseInt(afterCards[0].dataset.id)) 
      : null;
    
    const beforeRank = beforeIssue?.rank ?? -1;
    const afterRank = afterIssue?.rank ?? (beforeRank >= 0 ? beforeRank + 1 : 1);
    
    issue.rank = (beforeRank + afterRank) / 2;
    
    saveState();
    renderBoard();
    updateCounts();
    showUndoToast('Card reordered', () => {
      issue.rank = beforeIssue?.rank ?? afterIssue?.rank ?? 0;
      saveState();
      renderBoard();
      updateCounts();
      removeUndoToast();
      showToast('Reorder undone', 'success');
    });
  } else {
    // Move to different column
    const maxRank = getIssues().filter(i => i.status === newStatus)
      .reduce((max, i) => Math.max(max, i.rank ?? 0), -1);
    
    issue.rank = finalIndex < maxRank + 1 ? (maxRank >= 0 ? maxRank / 2 : 0) : maxRank + 1;
    issue.status = newStatus;
    trackHistory(issue, 'status', oldStatus, newStatus);
    
    saveState();
    renderBoard();
    updateCounts();
    const statusLabels = { todo: 'To Do', inprogress: 'In Progress', review: 'In Review', done: 'Done' };
    showUndoToast(`Moved to ${statusLabels[newStatus]}`, () => {
      issue.status = oldStatus;
      saveState();
      renderBoard();
      updateCounts();
      removeUndoToast();
      showToast('Status restored', 'success');
    });
  }
  
  // Cleanup
  draggedSource = null;
  draggedTarget = null;
});
```

---

## Task 6: Add Module-Level State for Drag Tracking

**File:** `src/events.js`

Add at module scope (near other module-level vars):

```js
// Drag & drop state
let draggedId = null;
let draggedCard = null;
let draggedSource = null;   // { columnId, index }
let draggedTarget = null;   // { columnId, index, edge }
```

Update the `dragend` handler to clean these up:

```js
col.addEventListener('dragend', e => {
  const card = e.target.closest('.issue-card');
  if (card) card.classList.remove('dragging');
  removeDropIndicators();
  col.classList.remove('drag-over');
  draggedId = null;
  draggedCard = null;
  draggedSource = null;
  draggedTarget = null;
});
```

---

## Task 7: Add CSS for Drag Ghost / Visual Polish

**File:** `styles.css`

Add these rules:

```css
/* Custom drag ghost styling */
.issue-card.dragging {
  opacity: 0.5;
  transform: rotate(2deg);
  box-shadow: 0 8px 24px var(--shadow);
  z-index: 100;
  transition: none;
}

/* Smooth indicator animation */
.drop-indicator {
  height: 3px;
  background: var(--primary);
  border-radius: 2px;
  margin: 2px 0;
  transition: all 0.1s ease;
  animation: indicatorPulse 0.6s ease infinite;
}

@keyframes indicatorPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* Column highlight when dragging over */
.column-body.drag-over {
  background: var(--border-light);
  border-radius: 6px;
}
```

---

## Task 8: Handle Custom Columns (non-status-mapped)

**File:** `src/events.js`

The current code only maps cards by `status`. For custom columns (no `status` mapping), cards won't appear. The drag-and-drop logic should:

1. In `renderBoard()`, when a column has no `status` mapping, show all issues (current behavior is broken — it shows none)
2. In the drop handler, for custom columns, don't change `status` — just update `rank`
3. Add a `columnId` property to issues for custom column tracking

**Change in `render.js` `renderBoard()` column rendering:**

```js
// Current (broken for custom columns):
// if (colDef.status) return i.status === colDef.status;
// return false;  // ← Custom columns show nothing!

// Should become:
if (colDef.status) {
  return i.status === colDef.status;
} else {
  // Custom column: show issues assigned to this column
  return i.customColumnId === colDef.id;
}
```

This requires adding `customColumnId` to the issue data model. For backward compatibility, default to the status-based columns.

---

## Implementation Order

1. **Task 2** — Extract helper functions (no visual change, safe)
2. **Task 7** — Add CSS polish (visual only, no logic change)
3. **Task 6** — Add module-level drag state vars
4. **Task 3** — Refactor `dragstart` with `setDragImage`
5. **Task 4** — Refactor `dragover` with `getClosestEdge` + DOM indicator
6. **Task 5** — Refactor `drop` with `getDestinationIndex`
7. **Task 1** — Add `.drop-indicator` CSS
8. **Task 8** — Fix custom column support (separate concern, larger change)

## Risk Assessment

| Risk | Mitigation |
|---|---|
| `setDragImage` with the card element may cause flicker during drag | Use a clone/clone of card for drag image, not the element itself |
| DOM-inserted indicator may cause layout shifts | Use `position: absolute` as fallback; DOM insertion only if it doesn't cause jitter |
| Custom column `columnId` tracking requires data migration | Backward compatible: issues without `customColumnId` default to status-based columns |

## Testing Plan

1. Drag a card between columns → status changes, indicator shows correctly
2. Reorder cards within a column → rank updates, indicator animates
3. Drop on empty column → indicator at top, card placed first
4. Drop on empty custom column → no status change, rank updated
5. Quick successive drags → no stale indicator artifacts
6. Drag with dark theme → indicator visible
7. Keyboard arrow navigation still works while cards are being dragged
