<script lang="ts">
  import { X } from "lucide-svelte";
  import type { Project } from "$lib/api";
  import { type CapMode, toCapMode } from "$lib/capitalize";
  import { defaultHue } from "$lib/marble";
  import { projects } from "$lib/projects.svelte";
  import Actions from "./project-editor/Actions.svelte";
  import AvatarPicker from "./project-editor/AvatarPicker.svelte";
  import CapPicker from "./project-editor/CapPicker.svelte";
  import NameEditor from "./project-editor/NameEditor.svelte";
  import ProjectAvatar from "./ProjectAvatar.svelte";

  let { project, onClose }: { project: Project; onClose: () => void } = $props();

  /* svelte-ignore state_referenced_locally */
  let tab = $state<"auto" | "emoji" | "image">(project.avatarType as "auto" | "emoji" | "image");
  const live = $derived(projects.byId(project.id) ?? project);
  let confirmDelete = $state(false);

  // parentsDraft mirrors persisted parentIds while editing so the UI reflects
  // additions/removals instantly without a server hop.
  /* svelte-ignore state_referenced_locally */
  let nameDraft = $state(project.name);
  /* svelte-ignore state_referenced_locally */
  let parentsDraft = $state<string[]>([...project.parentIds]);

  const parentObjects = $derived(parentsDraft.map((id) => projects.byId(id)).filter((p): p is Project => !!p));

  let busy = $state(false);
  /* svelte-ignore state_referenced_locally */
  let preview = $state<Project>({ ...project });
  /* svelte-ignore state_referenced_locally */
  let hueDraft = $state(project.hue ?? defaultHue(project.name));

  // Save name + parents whenever something actually changed.
  async function commit() {
    const name = nameDraft.trim();
    const cur = projects.byId(project.id) ?? project;
    const patch: { name?: string; parentIds?: string[] } = {};
    if (name && name !== cur.name) patch.name = name;
    const samePar = parentsDraft.length === cur.parentIds.length && parentsDraft.every((id, i) => id === cur.parentIds[i]);
    if (!samePar) patch.parentIds = parentsDraft;
    if (Object.keys(patch).length) await projects.update(project.id, patch);
  }

  function cancel() {
    nameDraft = live.name;
    parentsDraft = [...live.parentIds];
  }

  async function toggleHidden() {
    busy = true;
    await projects.update(project.id, { hidden: !live.hidden });
    busy = false;
  }

  async function remove() {
    busy = true;
    await projects.remove(project.id);
    onClose();
  }

  async function pick(patch: Partial<Project>) {
    busy = true;
    preview = { ...preview, ...patch } as Project;
    await projects.update(project.id, patch as never);
    busy = false;
  }

  function setHuePreview(v: number) {
    hueDraft = v;
    preview = { ...preview, avatarType: "auto", hue: v } as Project;
  }

  const capMode = $derived(toCapMode(live.capitalization));
  async function setCap(mode: CapMode) {
    if (mode === capMode) return;
    await projects.update(project.id, { capitalization: mode } as never);
  }
</script>

<div class="space-y-4">
  <div class="flex items-start gap-3">
    <ProjectAvatar project={preview} size={44} />
    <div class="min-w-0 flex-1">
      <NameEditor
        bind:name={nameDraft}
        parents={parentsDraft}
        selfId={project.id}
        onCommit={commit}
        onCancel={cancel}
        onAddParent={(p) => (parentsDraft = [...parentsDraft, p.id])}
      />
      <div class="mt-2 flex flex-wrap items-center gap-1.5 min-h-[20px]">
        {#each parentObjects as p (p.id)}
          <span class="pill pill-project">
            <ProjectAvatar project={p} size={12} />
            {p.name}
            <button
              type="button"
              onclick={() => (parentsDraft = parentsDraft.filter((x) => x !== p.id))}
              aria-label="Remove parent"
              class="ml-0.5 text-[var(--color-ink-3)] hover:text-[var(--color-danger)]"
            >
              <X size={10} />
            </button>
          </span>
        {:else}
          <span class="text-[11px] text-[var(--color-ink-3)]">Type @ to nest under another project</span>
        {/each}
      </div>
    </div>
  </div>

  <AvatarPicker
    bind:tab
    bind:hue={hueDraft}
    onAutoPick={() => pick({ avatarType: "auto" })}
    onPick={(patch) => {
      if (patch.hue != null) setHuePreview(patch.hue);
      pick(patch);
    }}
  />

  <CapPicker mode={capMode} name={live.name} onSelect={setCap} />

  <button
    onclick={onClose}
    disabled={busy}
    class="w-full py-2.5 rounded-2xl bg-[var(--color-accent)] text-[var(--color-bg)] text-[13px] font-medium
      active:scale-[0.98] transition-transform disabled:opacity-50"
  >
    Done
  </button>

  <Actions
    {busy}
    hidden={live.hidden}
    bind:confirming={confirmDelete}
    label={live.name}
    onToggleHidden={toggleHidden}
    onDelete={remove}
  />
</div>
