<script lang="ts">
  import { Capacitor } from "@capacitor/core";
  import { onMount, tick } from "svelte";
  import { renderEditorHtml } from "$lib/pillHtml";
  import { projects } from "$lib/projects.svelte";
  import { itemToPillHtml } from "./rich-input/choose";
  import { bindClipboard } from "./rich-input/clipboard";
  import { canonical, type QueryContext, readQueryAtCaret } from "./rich-input/editor-dom";
  import { buildEditorKeydown } from "./rich-input/keyboard";
  import { createPlaceDebouncer } from "./rich-input/place-debounce";
  import { computePickerStyle, detectTouchDevice } from "./rich-input/picker-position";
  import { buildItems } from "./rich-input/suggest";
  import SuggestionList from "./rich-input/SuggestionList.svelte";
  import type { Item } from "./rich-input/types";

  let {
    value = "",
    placeholder = "",
    autofocus = false,
    submitOnBlur = false,
    flush = false,
    endSlot,
    onsubmit,
    onTabNav,
  }: {
    value?: string;
    placeholder?: string;
    autofocus?: boolean;
    submitOnBlur?: boolean;
    /** Render with no chrome — for inline use inside a row that provides its own. */
    flush?: boolean;
    /** Snippet rendered absolutely in the bottom-right of the input. */
    endSlot?: import("svelte").Snippet;
    onsubmit: (text: string) => void;
    /** Tab/Shift+Tab with no autocomplete open — commit and move focus. */
    onTabNav?: (dir: 1 | -1) => void;
  } = $props();

  let editor: HTMLDivElement | undefined = $state();
  let touchDevice = false;
  let open = $state(false);
  let items = $state<Item[]>([]);
  let active = $state(0);
  let pickerStyle = $state("");
  let query: QueryContext = null;
  let placeItems = $state<Item[]>([]);
  let clipboard: ReturnType<typeof bindClipboard> | null = null;

  $effect(() => {
    void items.length;
    if (open && editor) pickerStyle = computePickerStyle(editor);
  });

  const places = createPlaceDebouncer((results, q) => {
    placeItems = results.map((p) => ({ kind: "place", place: p }));
    refreshItems(q, true);
  });

  onMount(() => {
    touchDevice = detectTouchDevice(Capacitor.isNativePlatform());
    if (editor) {
      editor.innerHTML = renderEditorHtml(value, projects.list);
      clipboard = bindClipboard(editor, () => projects.list, onInput);
    }
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

  const serialize = () => (editor ? canonical(editor) : "");

  function close() {
    open = false;
    query = null;
    placeItems = [];
    places.cancel();
  }

  function refreshItems(q: string, skipPlaceFetch = false) {
    items = buildItems({ query: q, projects: projects.list, placeItems });
    active = 0;
    open = items.length > 0;
    if (!skipPlaceFetch) places.schedule(q);
  }

  function replaceQuery(html: string) {
    if (!query || !editor) return;
    const r = document.createRange();
    r.setStart(query.node, query.start);
    r.setEnd(query.node, query.end);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
    editor.focus();
    document.execCommand("insertHTML", false, `${html}&nbsp;`);
    close();
  }

  async function choose(item: Item) {
    replaceQuery(await itemToPillHtml(item));
    editor?.focus();
  }

  function submit() {
    const text = serialize();
    if (!text) return;
    onsubmit(text);
  }

  export function clear() {
    if (editor) editor.innerHTML = "";
  }
  export { submit };

  /* svelte-ignore state_referenced_locally */
  const onKeydown = buildEditorKeydown({
    open: () => open,
    active: { get: () => active, set: (n) => (active = n) },
    itemsLen: () => items.length,
    choose: (i) => choose(items[i]),
    close,
    editor: () => editor,
    onInput: () => onInput(),
    submit,
    isTouch: () => touchDevice,
    onTabNav: onTabNav ? (dir) => onTabNav(dir) : undefined,
  });

  async function onInput() {
    if (editor && (editor.textContent ?? "").replace(/​/g, "") === "" && !editor.querySelector("[data-token]"))
      editor.innerHTML = "";
    await tick();
    if (!editor) return close();
    query = readQueryAtCaret(editor);
    if (!query) return close();
    refreshItems(query.text);
  }
</script>

<div class="relative flex-1 min-w-0">
  <div
    bind:this={editor}
    role="textbox"
    tabindex="0"
    aria-label={placeholder}
    contenteditable="true"
    data-placeholder={placeholder}
    class={flush
      ? "rich-input text-[13px] font-light tracking-wide leading-[21px] min-h-[21px] focus:outline-none"
      : `rich-input min-h-[46px] py-3 pl-4 ${endSlot ? "pr-11" : "pr-4"} rounded-2xl bg-[var(--color-surface)] text-[13px] font-light tracking-wide leading-[1.7] border border-[var(--color-border)] focus:border-[var(--color-accent)] focus:bg-[var(--color-surface-2)] focus:outline-none transition-all duration-300`}
    oninput={onInput}
    onkeydown={onKeydown}
    oncopy={(e) => clipboard?.onCopy(e)}
    oncut={(e) => clipboard?.onCut(e)}
    onpaste={(e) => clipboard?.onPaste(e)}
    onblur={() =>
      setTimeout(() => {
        close();
        if (submitOnBlur) submit();
      }, 150)}
  ></div>

  {#if endSlot}
    <div class="absolute right-2 bottom-2 pointer-events-auto">
      {@render endSlot()}
    </div>
  {/if}

  {#if open}
    <SuggestionList {items} bind:active style={pickerStyle} onPick={choose} />
  {/if}
</div>
