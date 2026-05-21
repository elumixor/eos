<script lang="ts">
  import { onMount, tick } from "svelte";
  import { Plus, MapPin, Link2 } from "lucide-svelte";
  import { Capacitor } from "@capacitor/core";
  import type { Project } from "$lib/api";
  import { applyCap, toCapMode } from "$lib/capitalize";
  import { projects } from "$lib/projects.svelte";
  import { pillElement, renderEditorHtml } from "$lib/pillHtml";
  import { fmtLinkLabel, isUrlLike, normalizeUrl, suggestTokens, type Segment, type Suggestion } from "$lib/tokens";
  import { searchPlaces, type Place } from "$lib/placeSearch";

  // Move the element to <body> so position:fixed is viewport-relative even
  // when an ancestor has a transform (animate-fade-up creates a containing
  // block that would otherwise trap it behind later task cards).
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  let {
    value = "",
    placeholder = "",
    autofocus = false,
    submitOnBlur = false,
    onsubmit,
    onTabNav,
  }: {
    value?: string;
    placeholder?: string;
    autofocus?: boolean;
    submitOnBlur?: boolean;
    onsubmit: (text: string) => void;
    /** Tab/Shift+Tab pressed with no autocomplete open — commit and move focus. */
    onTabNav?: (dir: 1 | -1) => void;
  } = $props();

  let editor: HTMLDivElement | undefined = $state();

  // Coarse-pointer devices (phones, tablets) have no easy way to type a
  // newline other than Enter, so on those Enter inserts a line break instead
  // of submitting. Desktops keep Enter-to-submit.
  function isTouchDevice(): boolean {
    if (typeof window === "undefined") return false;
    if (Capacitor.isNativePlatform()) return true;
    return !!window.matchMedia?.("(pointer: coarse)").matches;
  }

  type Item =
    | { kind: "project"; project: Project }
    | { kind: "create"; name: string }
    | { kind: "token"; sug: Suggestion }
    | { kind: "place"; place: Place }
    | { kind: "link"; url: string };

  let open = $state(false);
  let items = $state<Item[]>([]);
  let active = $state(0);
  // Fixed-position style so the picker escapes every ancestor stacking
  // context (task cards/items create their own via transforms).
  let pickerStyle = $state("");

  $effect(() => {
    // re-run on open / items change
    void items.length;
    if (!open || !editor) return;
    const rect = editor.getBoundingClientRect();
    const gap = 6;
    const maxH = 256;
    const below = window.innerHeight - rect.bottom;
    const above = rect.top;
    const placeAbove = below < maxH + gap && above > below;
    const vert = placeAbove
      ? `bottom:${Math.round(window.innerHeight - rect.top + gap)}px`
      : `top:${Math.round(rect.bottom + gap)}px`;
    pickerStyle = `left:${Math.round(rect.left)}px;width:${Math.round(rect.width)}px;${vert}`;
  });
  // Caret context for replacing the typed "@query".
  let qNode: Text | null = null;
  let qStart = 0;
  let qEnd = 0;

  onMount(() => {
    if (editor) editor.innerHTML = renderEditorHtml(value, projects.list);
    if (autofocus) focusEnd();
  });

  function focusEnd() {
    if (!editor) return;
    editor.focus();
    const r = document.createRange();
    r.selectNodeContents(editor);
    r.collapse(false);
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(r);
  }

  function canonical(root: Node): string {
    let out = "";
    const walk = (node: Node, depth = 0) => {
      let first = true;
      for (const n of Array.from(node.childNodes)) {
        if (n.nodeType === Node.TEXT_NODE) {
          out += n.textContent ?? "";
        } else if (n instanceof HTMLElement) {
          if (n.dataset.token) {
            out += ` ${n.dataset.token} `;
          } else if (n.tagName === "BR") {
            out += "\n";
          } else {
            // Some browsers (Chrome/Safari) wrap each line of a
            // contenteditable in <div> or <p> blocks; treat those as line
            // breaks so newlines survive serialization.
            const isBlock = n.tagName === "DIV" || n.tagName === "P";
            if (isBlock && depth === 0 && !first) out += "\n";
            walk(n, depth + 1);
          }
        }
        first = false;
      }
    };
    walk(root);
    // Collapse only runs of inline whitespace (spaces/tabs); keep newlines.
    return out
      .replace(/[ \t]+/g, " ")
      .replace(/ ?\n ?/g, "\n")
      .replace(/^\n+|\n+$/g, "")
      .trim();
  }

  function serialize(): string {
    return editor ? canonical(editor) : "";
  }

  function selectionRange(): Range | null {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount || !editor) return null;
    const r = sel.getRangeAt(0);
    return editor.contains(r.commonAncestorContainer) ? r : null;
  }

  function onCopy(e: ClipboardEvent) {
    const r = selectionRange();
    if (!r) return;
    const text = canonical(r.cloneContents());
    if (!text) return;
    e.preventDefault();
    e.clipboardData?.setData("text/plain", text);
  }

  function onCut(e: ClipboardEvent) {
    const r = selectionRange();
    if (!r) return;
    e.preventDefault();
    e.clipboardData?.setData("text/plain", canonical(r.cloneContents()));
    editor?.focus();
    document.execCommand("delete");
    onInput();
  }

  function onPaste(e: ClipboardEvent) {
    const text = e.clipboardData?.getData("text/plain") ?? "";
    if (!text) return;
    e.preventDefault();
    editor?.focus();
    // Tokens (@project:/@time:/@dur:) become pills again; anything else is
    // inserted as escaped plain text.
    document.execCommand("insertHTML", false, renderEditorHtml(text, projects.list));
    onInput();
  }

  function close() {
    open = false;
    qNode = null;
    placeItems = [];
    placeQuery = "";
    if (placeTimer) {
      clearTimeout(placeTimer);
      placeTimer = null;
    }
  }

  function detectQuery() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return close();
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE || !editor?.contains(node)) return close();
    const text = (node as Text).textContent ?? "";
    const before = text.slice(0, range.startOffset);
    // Allow one inner space so "@tomorrow 19pm" / "@eiffel tower" keeps the
    // picker open. A second space (or another @) closes it.
    const m = before.match(/@([^\s@]*(?: [^\s@]*)?)$/);
    if (!m) return close();
    qNode = node as Text;
    qStart = range.startOffset - m[0].length;
    qEnd = range.startOffset;
    buildItems(m[1]);
  }

  // Debounced Google Places lookup. Latest-query-wins; out-of-date responses
  // are dropped so a slow flight doesn't clobber what the user is seeing now.
  let placeTimer: ReturnType<typeof setTimeout> | null = null;
  let placeQuery = "";
  let placeItems = $state<Item[]>([]);
  function schedulePlaceSearch(query: string) {
    if (placeTimer) clearTimeout(placeTimer);
    if (query.trim().length < 2) {
      placeItems = [];
      placeQuery = query;
      return;
    }
    placeTimer = setTimeout(async () => {
      const issued = query;
      placeQuery = issued;
      const results = await searchPlaces(issued);
      if (placeQuery !== issued) return; // user kept typing
      placeItems = results.map((p) => ({ kind: "place", place: p }));
      // Rebuild visible items with the new place batch merged in.
      buildItems(issued, true);
    }, 200);
  }

  function buildItems(query: string, skipPlaceFetch = false) {
    const q = query.trim().toLowerCase();
    const list: Item[] = [];

    const matched = projects.list
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const as = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bs = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        return as - bs || a.name.localeCompare(b.name);
      });
    const exact = projects.list.find((p) => p.name.toLowerCase() === q);

    const tokens = suggestTokens(query).map((sug) => ({ kind: "token", sug }) as Item);
    const linkUrl = isUrlLike(query) ? normalizeUrl(query) : null;

    // Auto-rank: exact project → strong token → link → projects → places → tokens → create.
    if (exact) list.push({ kind: "project", project: exact });
    const strong = tokens.filter((t) => t.kind === "token" && t.sug.score >= 9);
    list.push(...strong);
    if (linkUrl) list.push({ kind: "link", url: linkUrl });
    list.push(...matched.filter((p) => p !== exact).map((p) => ({ kind: "project", project: p }) as Item));
    list.push(...placeItems);
    list.push(...tokens.filter((t) => !strong.includes(t)));
    if (q && !exact) list.push({ kind: "create", name: query.trim() });

    items = list;
    active = 0;
    open = list.length > 0;

    if (!skipPlaceFetch) schedulePlaceSearch(query);
  }

  function replaceQuery(html: string) {
    if (!qNode || !editor) return;
    // Select the typed "@query" then replace via execCommand so the edit
    // lands on the browser's native undo stack (Ctrl/Cmd+Z works).
    const r = document.createRange();
    r.setStart(qNode, qStart);
    r.setEnd(qNode, qEnd);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
    editor.focus();
    document.execCommand("insertHTML", false, `${html}&nbsp;`);
    close();
  }

  async function choose(item: Item) {
    if (item.kind === "project") {
      replaceQuery(pillElement({ kind: "project", id: item.project.id, project: item.project }));
    } else if (item.kind === "create") {
      const p = await projects.create(item.name);
      replaceQuery(pillElement({ kind: "project", id: p.id, project: p }));
    } else if (item.kind === "place") {
      replaceQuery(
        pillElement({ kind: "place", name: item.place.name, lat: item.place.lat, lng: item.place.lng }),
      );
    } else if (item.kind === "link") {
      replaceQuery(pillElement({ kind: "link", url: item.url }));
    } else {
      const t = item.sug.token;
      let seg: Segment;
      if (t.startsWith("@dur:")) seg = { kind: "dur", minutes: Number(t.slice(5)) };
      else {
        const v = t.slice(6);
        const hasTime = v.includes("T");
        seg = { kind: "time", date: new Date(v), hasTime };
      }
      replaceQuery(pillElement(seg));
    }
    editor?.focus();
  }

  function submit() {
    const text = serialize();
    if (!text) return;
    onsubmit(text);
  }

  // Exposed so a parent submit button can trigger it.
  export function clear() {
    if (editor) editor.innerHTML = "";
  }
  export { submit };

  const isBlank = (n: Node | null | undefined) =>
    !!n && n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").replace(/​/g, "") === "";

  // Delete a whole pill (and its surrounding zero-width spaces) in one
  // Backspace press when the caret sits just after it.
  function killPillBackward(): boolean {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed || !editor) return false;
    const r = sel.getRangeAt(0);
    const c = r.startContainer;
    const o = r.startOffset;
    const kill: ChildNode[] = [];
    let prev: ChildNode | null = null;

    if (c.nodeType === Node.TEXT_NODE && editor.contains(c)) {
      const left = (c.textContent ?? "").slice(0, o);
      if (left.replace(/​/g, "").length > 0) return false; // real text → normal delete
      prev = (c as ChildNode).previousSibling;
    } else if (c === editor) {
      prev = (editor.childNodes[o - 1] as ChildNode) ?? null;
    } else {
      return false;
    }

    while (isBlank(prev)) {
      kill.push(prev as ChildNode);
      prev = (prev as ChildNode).previousSibling;
    }
    if (!(prev instanceof HTMLElement) || !prev.dataset.token) return false;

    const pill = prev;
    // Select [leading zwsp?][pill][blank nodes][caret] and delete via
    // execCommand so the removal is on the native undo stack.
    const lead = pill.previousSibling;
    const del = document.createRange();
    if (isBlank(lead)) del.setStartBefore(lead as Node);
    else del.setStartBefore(pill);
    del.setEnd(c, o);
    sel.removeAllRanges();
    sel.addRange(del);
    editor.focus();
    document.execCommand("delete");
    return true;
  }

  function onKeydown(e: KeyboardEvent) {
    if (open) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        active = (active + 1) % items.length;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        active = (active - 1 + items.length) % items.length;
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        choose(items[active]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
      return;
    }
    if (e.key === "Backspace" && killPillBackward()) {
      e.preventDefault();
      onInput();
      return;
    }
    if (e.key === "Enter") {
      // Touch devices: Enter is the only way to insert a newline, so let it
      // through (preventing default would lose the keystroke). Submit is
      // reachable via the explicit button or blur. Desktop keeps Enter=submit
      // since users have Shift+Enter / external means to type newlines and
      // the existing convention is Enter-to-add.
      if (isTouchDevice()) {
        e.preventDefault();
        document.execCommand("insertLineBreak");
        onInput();
        return;
      }
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === "Tab" && onTabNav) {
      e.preventDefault();
      const dir: 1 | -1 = e.shiftKey ? -1 : 1;
      submit();
      onTabNav(dir);
    }
  }

  async function onInput() {
    if (
      editor &&
      (editor.textContent ?? "").replace(/​/g, "") === "" &&
      !editor.querySelector("[data-token]")
    )
      editor.innerHTML = "";
    await tick();
    detectQuery();
  }
</script>

<div class="relative flex-1">
  <div
    bind:this={editor}
    role="textbox"
    tabindex="0"
    aria-label={placeholder}
    contenteditable="true"
    data-placeholder={placeholder}
    class="rich-input min-h-[46px] px-4 py-3 rounded-2xl bg-[var(--color-surface)] text-[13px] font-light
      tracking-wide border border-[var(--color-border)] focus:border-[var(--color-accent)]
      focus:bg-[var(--color-surface-2)] focus:outline-none transition-all duration-300"
    oninput={onInput}
    onkeydown={onKeydown}
    oncopy={onCopy}
    oncut={onCut}
    onpaste={onPaste}
    onblur={() =>
      setTimeout(() => {
        close();
        if (submitOnBlur) submit();
      }, 150)}
  ></div>

  {#if open}
    <div
      use:portal
      class="fixed z-[200] max-h-64 overflow-y-auto py-1.5
        rounded-2xl bg-[var(--color-surface-2)] border border-[var(--color-border)]
        shadow-xl shadow-black/40 animate-fade-in"
      style={pickerStyle}
    >
      {#each items as item, i (i)}
        <button
          type="button"
          onpointerdown={(e) => {
            e.preventDefault();
            choose(item);
          }}
          onmouseenter={() => (active = i)}
          class="w-full flex items-center gap-2.5 px-3.5 py-2 text-left transition-colors
            {i === active ? 'bg-[var(--color-surface-3)]' : ''}"
        >
          {#if item.kind === "project"}
            {@const ups = projects.parentsOf(item.project.id)}
            <span class="pill pill-project">
              {#await import("./ProjectAvatar.svelte") then { default: PA }}
                <PA project={item.project} size={14} />
              {/await}
              {applyCap(item.project.name, toCapMode(item.project.capitalization), true)}
            </span>
            {#if ups.length}
              <span class="ml-auto flex items-center gap-1 flex-wrap justify-end">
                {#each ups as up (up.id)}
                  <span class="pill pill-project pill-muted">
                    {#await import("./ProjectAvatar.svelte") then { default: PA }}
                      <PA project={up} size={12} />
                    {/await}
                    {applyCap(up.name, toCapMode(up.capitalization), true)}
                  </span>
                {/each}
              </span>
            {:else}
              <span class="ml-auto text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">
                Project
              </span>
            {/if}
          {:else if item.kind === "link"}
            <span
              class="w-[18px] h-[18px] rounded-full bg-[oklch(72%_0.14_235_/_0.16)]
                text-[oklch(78%_0.11_235)] flex items-center justify-center shrink-0"
            >
              <Link2 size={11} strokeWidth={2.5} />
            </span>
            <span class="text-[13px] font-medium text-[var(--color-ink)] flex-1 truncate">
              {fmtLinkLabel(item.url)}
            </span>
            <span class="ml-auto text-[10px] uppercase tracking-wider text-[var(--color-ink-3)] truncate max-w-[40%]">
              Link
            </span>
          {:else if item.kind === "place"}
            <span
              class="w-[18px] h-[18px] rounded-full bg-[oklch(74%_0.14_155_/_0.16)]
                text-[oklch(78%_0.12_155)] flex items-center justify-center shrink-0"
            >
              <MapPin size={11} strokeWidth={2.5} />
            </span>
            <span class="text-[13px] font-medium text-[var(--color-ink)] flex-1 truncate">
              {item.place.name}
            </span>
            <span class="ml-auto text-[10px] uppercase tracking-wider text-[var(--color-ink-3)] truncate max-w-[40%]">
              {item.place.address || "Place"}
            </span>
          {:else if item.kind === "create"}
            <span
              class="w-[18px] h-[18px] rounded-full bg-[var(--color-accent-dim)] text-[var(--color-accent)]
                flex items-center justify-center shrink-0"
            >
              <Plus size={12} strokeWidth={3} />
            </span>
            <span class="text-[13px] font-medium text-[var(--color-ink)] flex-1 truncate">
              Create “{item.name}”
            </span>
            <span class="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">Project</span>
          {:else}
            <span
              class="w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0 text-[11px]
                {item.sug.type === 'dur'
                ? 'bg-[oklch(74%_0.14_280_/_0.16)] text-[oklch(78%_0.1_280)]'
                : 'bg-[oklch(72%_0.16_35_/_0.14)] text-[var(--color-voice)]'}"
            >
              {item.sug.type === "dur" ? "⏳" : "🕑"}
            </span>
            <span class="text-[13px] font-medium text-[var(--color-ink)] flex-1 truncate">
              {item.sug.label}
            </span>
            <span class="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">
              {item.sug.detail}
            </span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>
