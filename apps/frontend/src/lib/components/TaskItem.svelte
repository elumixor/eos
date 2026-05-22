<script lang="ts">
  import { untrack } from "svelte";
  import { Check, Trash2, Pencil, Copy, MoreHorizontal, Undo2 } from "lucide-svelte";
  import type { Task } from "$lib/api";
  import { stripTokens } from "$lib/tokens";
  import { dnd } from "$lib/dnd.svelte";
  import { swipeOpen } from "$lib/swipe.svelte";
  import { selection as multi } from "$lib/selection.svelte";
  import { notifySuccess, notifyWarning, tapLight, tapMedium, selection } from "$lib/haptics";
  import TaskContent from "./TaskContent.svelte";
  import RichTaskInput from "./RichTaskInput.svelte";

  // Move a node to <body> so `position: fixed` resolves against the viewport.
  // Task rows keep a `transform` (animate-fade-up, fill-mode: both), which
  // would otherwise become the containing block for the fixed menu.
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }

  let {
    task,
    index,
    listId,
    orderedIds,
    onToggle,
    onDelete,
    onEdit,
    onDuplicate,
    onBulkDelete,
    onBulkComplete,
  }: {
    task: Task;
    index: number;
    listId: string;
    /** All task ids in this list, in render order — used for shift-range. */
    orderedIds: string[];
    onToggle: (task: Task) => void;
    onDelete: (task: Task) => void;
    onEdit: (task: Task, text: string) => void;
    onDuplicate: (task: Task) => void;
    onBulkDelete: (ids: string[]) => void;
    onBulkComplete: (ids: string[], completed: boolean) => void;
  } = $props();

  let el: HTMLLIElement | undefined = $state();
  let cardEl: HTMLDivElement | undefined = $state();
  let mainEl: HTMLDivElement | undefined = $state();
  const isDragging = $derived(dnd.has(task.id));
  const isSelected = $derived(multi.has(task.id));

  let editing = $state(false);

  function startEdit() {
    editing = true;
  }

  // ---- Tab navigation ------------------------------------------------------
  // Tab moves focus to the next task row and opens it in edit mode; Shift+Tab
  // moves backwards. Action buttons inside the row are tabindex=-1 so they
  // don't trap Tab inside the row.
  function navigateTab(dir: 1 | -1) {
    const all = Array.from(document.querySelectorAll<HTMLElement>("[data-dnd-item]"));
    const idx = el ? all.indexOf(el) : -1;
    const next = all[idx + dir];
    if (!next) return;
    next.dispatchEvent(new CustomEvent("eos-edit-task", { bubbles: false }));
  }

  $effect(() => {
    if (!el) return;
    const handler = () => {
      editing = true;
    };
    el.addEventListener("eos-edit-task", handler);
    return () => el?.removeEventListener("eos-edit-task", handler);
  });

  function onStripKeydown(e: KeyboardEvent) {
    if (editing) return;
    if (e.key !== "Tab") return;
    e.preventDefault();
    navigateTab(e.shiftKey ? -1 : 1);
  }

  function commitEdit(text: string) {
    const trimmed = text.trim();
    if (trimmed && trimmed !== task.text) onEdit(task, trimmed);
    editing = false;
  }

  // ---- Swipe / gesture pipeline -------------------------------------------
  // One pointer pipeline drives everything: a short horizontal drag reveals an
  // action tray, a long full drag auto-fires it, a press-and-hold starts a
  // reorder drag, and a plain tap edits. Works for touch and mouse alike;
  // trackpads go through the wheel handler.

  // Layout: a 2.2× wide strip [left action 60%][main 100%][right 60%] slides
  // inside the row's clip box. Tray widths track the row width so the panels
  // remain edge-to-edge — no white gap can appear as the strip crosses zero.
  const TRAY_FRAC = 0.6; // each side panel is 60% of the row (= max swipe)
  const ICON_W = 64; // natural width of one action icon (Options / Delete / Check)
  // Snap-open ("peek") widths — small, icon-sized — distinct from the panel
  // width. Releasing past `*OPEN_FACTOR` snaps to these; releasing past
  // `tray * TRIGGER_RATIO` auto-fires.
  const PEEK_LEFT = ICON_W; // one icon
  const PEEK_RIGHT = ICON_W * 2; // Options + Delete
  const OPEN_FACTOR = 0.5; // release at half the peek width → snap open
  const TRIGGER_RATIO = 0.85; // release past 85% of the tray → auto-fire

  // Strip is (1 + 2·TRAY_FRAC) = 2.2× the row. Child widths are expressed as
  // a percentage of the strip itself, so the layout works before JS measures
  // anything (no flash on first paint).
  const STRIP_FRAC = 1 + 2 * TRAY_FRAC;
  const LEFT_PCT = (TRAY_FRAC / STRIP_FRAC) * 100; // ≈ 27.273 (= 60% of row)
  const MAIN_PCT = (1 / STRIP_FRAC) * 100; // ≈ 45.455 (= 100% of row)

  let tx = $state(0); // foreground card translateX
  let settling = $state(false); // enables the CSS transition while snapping

  // Spark-style progress signals — derived from tx so they update every frame
  // the gesture moves. `*Progress` is 0→1 over the peek distance (icon fade);
  // `armed` flips to ±1 once the swipe crosses the auto-fire threshold so the
  // panel can flash brighter as a "release will commit" cue.
  const leftProgress = $derived(Math.min(1, Math.max(0, tx) / PEEK_LEFT));
  const rightProgress = $derived(Math.min(1, Math.max(0, -tx) / PEEK_RIGHT));
  const armed = $derived(zoneOf(tx) === 2 ? Math.sign(tx) : 0);
  type Lock = null | "swipe" | "scroll" | "reorder";
  let lock: Lock = null;
  let active = false; // a pointer is currently down on this row
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let startTx = 0;
  let lpTimer: ReturnType<typeof setTimeout> | null = null;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  let wheelTimer: ReturnType<typeof setTimeout> | null = null;
  let lastZone = 0;

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  // Measured row width. Kept in state so the CSS strip can use it and the
  // gesture math (clamps, thresholds) stays consistent across resizes.
  let mainW = $state(0);
  const rowWidth = () => mainW || el?.getBoundingClientRect().width || 320;
  const trayW = () => rowWidth() * TRAY_FRAC; // LEFT_W === RIGHT_W

  $effect(() => {
    if (!el) return;
    mainW = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el) mainW = el.clientWidth;
    });
    ro.observe(el);
    return () => ro.disconnect();
  });

  function clearLp() {
    if (lpTimer) {
      clearTimeout(lpTimer);
      lpTimer = null;
    }
  }

  function animateTo(v: number) {
    settling = true;
    tx = v;
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => (settling = false), 210);
  }

  function closeTray() {
    animateTo(0);
    if (swipeOpen.id === task.id) swipeOpen.id = null;
  }

  // 0 = closed, 1 = open at the icon peek, 2 = far enough to auto-fire.
  function zoneOf(v: number) {
    const t = trayW();
    const a = Math.abs(v);
    const peek = v >= 0 ? PEEK_LEFT : PEEK_RIGHT;
    return a >= t * TRIGGER_RATIO ? 2 : a >= peek * OPEN_FACTOR ? 1 : 0;
  }

  // Modifier flags captured at pointerdown so onUp can act as a tap-click.
  let modShift = false;
  let modMeta = false;

  function startReorder(x: number, y: number, pid: number) {
    lock = "reorder";
    tapLight();
    tx = 0;
    cardEl?.releasePointerCapture?.(pid);
    // If this task is part of a multi-selection, the whole selection
    // travels together. Otherwise it's a plain single drag.
    const ids = multi.has(task.id) && multi.size > 1 ? multi.list : [task.id];
    const label = ids.length > 1 ? `${ids.length} tasks` : task.text;
    dnd.start(ids, label, listId, { clientX: x, clientY: y }, rowWidth());
  }

  function onDown(e: PointerEvent) {
    // Don't let the row's gesture reach DailySection's header swipe (which
    // pages the day on >50px horizontal moves).
    e.stopPropagation();
    if (editing || e.button === 2) return;
    // If the press starts on a side panel (the action buttons), don't drive
    // the swipe pipeline — let the button receive its click cleanly.
    if (mainEl && !mainEl.contains(e.target as Node)) return;
    active = true;
    lock = null;
    startX = lastX = e.clientX;
    startY = lastY = e.clientY;
    startTx = tx;
    lastZone = zoneOf(tx);
    modShift = e.shiftKey;
    modMeta = e.metaKey || e.ctrlKey;
    clearLp();
    // Touch: press-and-hold starts a reorder (vertical drag is scrolling).
    // Mouse: skip the long-press — vertical drag in onMove starts reorder
    // immediately, because there's no native scroll gesture to compete with.
    if (e.pointerType !== "mouse") {
      lpTimer = setTimeout(() => {
        if (!active || lock !== null) return;
        startReorder(lastX, lastY, e.pointerId);
      }, 450);
    }
  }

  function onMove(e: PointerEvent) {
    if (!active || lock === "reorder" || lock === "scroll") return;
    lastX = e.clientX;
    lastY = e.clientY;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (lock === null) {
      // Any real movement means this is a drag, not a press-and-hold — kill
      // the reorder timer immediately so a slow/paused drag never snaps back.
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) clearLp();

      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      // Require *dominant* horizontal motion before claiming a swipe, so a
      // vertical touch scroll with normal finger jitter doesn't get hijacked.
      // Vertical wins as soon as it crosses the 8px threshold (the browser
      // will already have taken over native pan-y for touch).
      if (ay > 8 && ay >= ax) {
        if (e.pointerType === "mouse") {
          startReorder(e.clientX, e.clientY, e.pointerId);
        } else {
          lock = "scroll"; // let the page scroll natively
        }
        return;
      }
      if (ax > 10 && ax > ay * 1.5) {
        lock = "swipe";
        settling = false;
        cardEl?.setPointerCapture?.(e.pointerId);
      } else {
        return;
      }
    }

    if (lock === "swipe") {
      e.preventDefault();
      const t = trayW();
      tx = clamp(startTx + dx, -t, t);
      const z = zoneOf(tx);
      if (z !== lastZone) {
        selection();
        lastZone = z;
      }
    }
  }

  function settle() {
    const zone = zoneOf(tx);
    if (tx > 0) {
      if (zone === 2) {
        handleToggle();
        closeTray();
      } else if (zone === 1) {
        animateTo(PEEK_LEFT);
        swipeOpen.id = task.id;
        tapMedium();
      } else {
        closeTray();
      }
    } else if (tx < 0) {
      if (zone === 2) {
        askDelete();
        closeTray();
      } else if (zone === 1) {
        animateTo(-PEEK_RIGHT);
        swipeOpen.id = task.id;
        tapMedium();
      } else {
        closeTray();
      }
    }
  }

  function onUp(e: PointerEvent) {
    active = false;
    clearLp();
    cardEl?.releasePointerCapture?.(e.pointerId);
    if (lock === "swipe") {
      settle();
    } else if (lock === null) {
      const moved = Math.abs(lastX - startX) > 6 || Math.abs(lastY - startY) > 6;
      if (!moved) {
        if (tx !== 0) {
          closeTray();
        } else if (modShift) {
          multi.rangeFromAnchor(orderedIds, task.id, listId);
        } else if (modMeta) {
          multi.toggle(task.id, listId);
        } else {
          // Plain click: clear any existing selection, then edit.
          if (multi.active) multi.clear();
          startEdit();
        }
      }
    }
    lock = null;
  }

  function onCancel(e: PointerEvent) {
    active = false;
    clearLp();
    cardEl?.releasePointerCapture?.(e.pointerId);
    if (lock === "swipe") settle();
    lock = null;
  }

  // Trackpad two-finger swipe arrives as `wheel` events. macOS keeps firing a
  // decaying momentum tail for ~1s after the fingers lift, so we track the
  // peak delta and treat the shrinking tail as "gesture ended", then swallow
  // the remaining momentum during a short cooldown so it can't re-settle.
  let wheelPeak = 0;
  let wheelLast = 0;
  let wheelCooldownUntil = 0;

  function handleWheel(e: WheelEvent) {
    if (editing || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    const now = performance.now();
    if (now < wheelCooldownUntil) return; // ignore the momentum tail

    if (now - wheelLast > 200) wheelPeak = 0; // a fresh gesture
    wheelLast = now;
    const ad = Math.abs(e.deltaX);
    wheelPeak = Math.max(wheelPeak, ad);

    settling = false;
    // Clamp to the tray width — the strip can't slide further without
    // exposing a blank edge. Trigger threshold is 0.85·tray, reachable
    // from a real flick. Momentum is swallowed below.
    const t = trayW();
    tx = clamp(tx - e.deltaX, -t, t);
    const z = zoneOf(tx);
    if (z !== lastZone) {
      selection();
      lastZone = z;
    }

    // Decaying tail → the active swipe is over. Settle now and lock out the
    // remaining momentum events.
    if (wheelPeak > 8 && ad < wheelPeak * 0.2) {
      if (wheelTimer) clearTimeout(wheelTimer);
      wheelCooldownUntil = now + 350;
      settle();
      return;
    }
    // Fallback for an abrupt stop with no momentum tail.
    if (wheelTimer) clearTimeout(wheelTimer);
    wheelTimer = setTimeout(settle, 160);
  }

  // Snap shut when another row opens, when a reorder starts, or on scroll.
  $effect(() => {
    const open = swipeOpen.id;
    if (open !== task.id)
      untrack(() => {
        if (tx !== 0 && lock !== "swipe") animateTo(0);
      });
  });
  $effect(() => {
    if (dnd.active && !dnd.has(task.id))
      untrack(() => {
        if (tx !== 0) animateTo(0);
      });
  });
  $effect(() => {
    function onScroll() {
      if (tx !== 0 && lock !== "swipe") closeTray();
    }
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  });

  // Tapping the revealed strip / buttons.
  function tapComplete() {
    handleToggle();
    closeTray();
  }

  function openOptions() {
    const r = el?.getBoundingClientRect();
    if (r) openMenu(r.right - 176, Math.min(r.top, window.innerHeight - 180));
    closeTray();
  }

  function deleteFromTray() {
    closeTray();
    askDelete();
  }

  // ---- Action menu (right-click on desktop, "Options" from the tray) -------
  let menuOpen = $state(false);
  let menuX = $state(0);
  let menuY = $state(0);
  let menuEl: HTMLDivElement | undefined = $state();

  function openMenu(x: number, y: number) {
    menuX = x;
    menuY = y;
    menuOpen = true;
    tapMedium();
  }

  // Clamp into the viewport after the menu has rendered, so it can never
  // spill off the right/bottom edge regardless of where it was opened.
  $effect(() => {
    if (!menuOpen || !menuEl) return;
    const pad = 8;
    const r = menuEl.getBoundingClientRect();
    const nx = Math.max(pad, Math.min(menuX, window.innerWidth - r.width - pad));
    const ny = Math.max(pad, Math.min(menuY, window.innerHeight - r.height - pad));
    if (nx !== menuX) menuX = nx;
    if (ny !== menuY) menuY = ny;
  });

  // Right-click on a task that's part of a multi-selection opens the bulk
  // variant of the menu (Delete N / Complete N / Uncomplete N); single-task
  // right-click keeps the existing Edit/Duplicate/Delete menu.
  let bulkCtx = $state(false);
  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    bulkCtx = multi.has(task.id) && multi.size > 1;
    openMenu(e.clientX, e.clientY);
  }

  function runMenu(action: () => void) {
    menuOpen = false;
    action();
  }

  // ---- Delete confirmation -------------------------------------------------
  let confirmDelete = $state(false);
  // Captures whether the pending confirm is for the bulk selection or just
  // this row, since `bulkCtx` itself is cleared when the menu closes.
  let confirmBulk = $state(false);

  function askDelete() {
    menuOpen = false;
    confirmBulk = bulkCtx;
    confirmDelete = true;
  }

  function doDelete() {
    confirmDelete = false;
    notifyWarning();
    if (confirmBulk) onBulkDelete(multi.list);
    else onDelete(task);
  }

  function bulkComplete(target: boolean) {
    onBulkComplete(multi.list, target);
  }

  function handleToggle() {
    if (!task.completed) notifySuccess();
    else tapLight();
    onToggle(task);
  }
</script>

<li
  bind:this={el}
  data-dnd-item={task.id}
  class="group relative overflow-hidden rounded-2xl
    {isSelected ? 'outline outline-2 outline-[var(--color-accent)]' : ''}
    {isDragging ? 'opacity-30' : 'animate-fade-up'}"
  style="animation-delay: {index * 50}ms"
  oncontextmenu={handleContextMenu}
  onwheel={handleWheel}
>
  <!--
    Single 220%-wide strip holding three panels edge-to-edge:
      [ left action 60% ][ main card 100% ][ right actions 60% ]
    The `<li>` clips overflow. The strip's resting transform is
    `translateX(-60%·row)`, expressed in strip units as `-LEFT_PCT%`, so the
    main card centers in the viewport. `tx` (px) is the swipe delta on top.
  -->
  <div
    bind:this={cardEl}
    class="flex w-[220%] {settling ? 'transition-transform duration-[260ms] [transition-timing-function:cubic-bezier(0.34,1.3,0.5,1)]' : ''}"
    style="transform: translateX(calc(-{LEFT_PCT}% + {tx}px)); touch-action: pan-y;"
    role="textbox"
    tabindex="0"
    onpointerdown={onDown}
    onpointermove={onMove}
    onpointerup={onUp}
    onpointercancel={onCancel}
    onkeydown={onStripKeydown}
  >
    <!-- Left action — revealed by swiping right. Green=complete, gray=undo.
         Icon sits at the panel's right edge (the inner edge next to the
         main card) so it appears immediately on a small peek. -->
    <button
      onclick={tapComplete}
      tabindex={-1}
      aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
      class="shrink-0 flex items-center justify-end transition-[filter] duration-150"
      style="width: {LEFT_PCT}%;
        background: {task.completed ? 'var(--color-surface-3)' : 'var(--color-accent)'};
        filter: brightness({armed > 0 ? 1.18 : 1});"
    >
      <div
        class="h-full flex items-center justify-center transition-transform duration-150"
        style="width: {ICON_W}px; opacity: {leftProgress}; transform: scale({0.6 + 0.4 * leftProgress + (armed > 0 ? 0.12 : 0)});"
      >
        {#if task.completed}
          <Undo2 size={18} class="text-[var(--color-ink)]" />
        {:else}
          <Check size={18} strokeWidth={3} class="text-[var(--color-bg)]" />
        {/if}
      </div>
    </button>

    <!-- Main card -->
    <div
      bind:this={mainEl}
      class="shrink-0 flex items-center gap-2.5 px-4 py-3.5 no-touch-select
        {task.completed ? 'bg-[var(--color-done)]' : 'bg-[var(--color-surface)]'}"
      style="width: {MAIN_PCT}%"
    >
      {#if editing}
        <RichTaskInput
          value={task.text}
          autofocus
          submitOnBlur
          flush
          placeholder="Edit task"
          onsubmit={commitEdit}
          onTabNav={navigateTab}
        />
      {:else}
        <div class="flex-1 min-w-0">
          <TaskContent {task} dimmed={task.completed} />
        </div>
      {/if}
    </div>

    <!-- Right actions — revealed by swiping left. Mirrors the action menu.
         Buttons sit at the panel's left edge (inner edge next to the main
         card). The Delete button stretches to fill the rest of the 60%
         panel so a longer swipe just reveals more red. -->
    <div
      class="shrink-0 flex bg-[var(--color-danger)] transition-[filter] duration-150"
      style="width: {LEFT_PCT}%; filter: brightness({armed < 0 ? 1.18 : 1});"
    >
      <button
        onclick={openOptions}
        tabindex={-1}
        aria-label="Options"
        class="h-full shrink-0 flex items-center justify-center bg-[var(--color-voice)] text-[var(--color-bg)]"
        style="width: {ICON_W}px"
      >
        <div
          class="flex items-center justify-center transition-transform duration-150"
          style="opacity: {rightProgress}; transform: scale({0.6 + 0.4 * rightProgress});"
        >
          <MoreHorizontal size={18} />
        </div>
      </button>
      <button
        onclick={deleteFromTray}
        tabindex={-1}
        aria-label="Delete"
        class="flex-1 h-full flex items-center justify-start text-white"
      >
        <div
          class="h-full flex items-center justify-center transition-transform duration-150"
          style="width: {ICON_W}px; opacity: {rightProgress}; transform: scale({0.6 + 0.4 * rightProgress + (armed < 0 ? 0.12 : 0)});"
        >
          <Trash2 size={18} />
        </div>
      </button>
    </div>
  </div>
</li>

{#if menuOpen}
  <div use:portal>
    <!-- Backdrop closes the menu on any outside interaction -->
    <button
      aria-label="Close menu"
      class="fixed inset-0 z-40 cursor-default"
      onpointerdown={() => (menuOpen = false)}
    ></button>
    <div
      bind:this={menuEl}
      class="fixed z-50 w-48 py-1.5 rounded-2xl bg-[var(--color-surface-2)] no-touch-select
        border border-[var(--color-border)] shadow-xl shadow-black/40 animate-fade-in"
      style="left: {menuX}px; top: {menuY}px;"
    >
      {#if bulkCtx}
        <button
          onclick={() => runMenu(() => bulkComplete(true))}
          class="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-light text-[var(--color-ink)]
            hover:bg-[var(--color-surface-3)] transition-colors"
        >
          <Check size={14} class="text-[var(--color-accent)]" />
          Mark {multi.size} complete
        </button>
        <button
          onclick={() => runMenu(() => bulkComplete(false))}
          class="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-light text-[var(--color-ink)]
            hover:bg-[var(--color-surface-3)] transition-colors"
        >
          <Undo2 size={14} class="text-[var(--color-ink-3)]" />
          Mark {multi.size} incomplete
        </button>
        <button
          onclick={() => runMenu(askDelete)}
          class="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-light text-[var(--color-danger)]
            hover:bg-[var(--color-danger-glow)] transition-colors"
        >
          <Trash2 size={14} />
          Delete {multi.size}
        </button>
      {:else}
        <button
          onclick={() => runMenu(startEdit)}
          class="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-light text-[var(--color-ink)]
            hover:bg-[var(--color-surface-3)] transition-colors"
        >
          <Pencil size={14} class="text-[var(--color-ink-3)]" />
          Edit
        </button>
        <button
          onclick={() => runMenu(() => onDuplicate(task))}
          class="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-light text-[var(--color-ink)]
            hover:bg-[var(--color-surface-3)] transition-colors"
        >
          <Copy size={14} class="text-[var(--color-ink-3)]" />
          Duplicate
        </button>
        <button
          onclick={() => runMenu(askDelete)}
          class="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-light text-[var(--color-danger)]
            hover:bg-[var(--color-danger-glow)] transition-colors"
        >
          <Trash2 size={14} />
          Delete
        </button>
      {/if}
    </div>
  </div>
{/if}

{#if confirmDelete}
  <div use:portal>
    <button
      aria-label="Cancel"
      class="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm animate-fade-in"
      onclick={() => (confirmDelete = false)}
    ></button>
    <div
      class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[61] w-[min(90vw,320px)]
        p-5 rounded-3xl bg-[var(--color-surface-2)] border border-[var(--color-border)]
        shadow-2xl shadow-black/50 animate-scale-in"
    >
      <p class="text-sm font-semibold mb-1">
        {confirmBulk ? `Delete ${multi.size} tasks?` : "Delete task?"}
      </p>
      <p class="text-[13px] font-light text-[var(--color-ink-2)] mb-4 line-clamp-2">
        {confirmBulk ? "This cannot be undone." : stripTokens(task.text)}
      </p>
      <div class="flex items-center gap-2">
        <button
          onclick={doDelete}
          class="flex-1 py-2.5 rounded-2xl bg-[var(--color-danger)] text-white text-[13px] font-medium
            active:scale-[0.98] transition-transform"
        >
          Delete
        </button>
        <button
          onclick={() => (confirmDelete = false)}
          class="px-4 py-2.5 rounded-2xl bg-[var(--color-surface)] text-[13px] font-medium
            text-[var(--color-ink-2)]"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}
