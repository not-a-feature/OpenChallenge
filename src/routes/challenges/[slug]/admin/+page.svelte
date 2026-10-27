<script lang="ts">
  import { enhance } from '$app/forms';
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { SlidersHorizontal, RefreshCw, ShieldCheck, AlertCircle, Activity, Clock3, FileText, ArrowUpRight, FolderOpen } from 'lucide-svelte';
  import StatusBadge from '#lib/components/StatusBadge.svelte';
  import type { PageData, ActionData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();
  onMount(() => { const timer = window.setInterval(() => { if (data.jobs.some((job) => ['queued', 'validating', 'scoring', 'running'].includes(job.status)) && document.visibilityState === 'visible') void invalidateAll(); }, 5000); return () => window.clearInterval(timer); });
</script>

<div class="page-heading"><div><p class="eyebrow">ORGANIZATION / OPERATIONS</p><h1>Organizer console</h1><p class="page-intro">Manage the challenge phase and monitor evaluation jobs.</p></div><span class="badge badge-neutral"><ShieldCheck size={14} aria-hidden="true" />Organizer access</span></div>
{#if form?.message}<div class="alert alert-warning" role="status"><AlertCircle size={17} aria-hidden="true" />{form.message}</div>{/if}
<section class="panel phase-panel"><div class="panel-heading"><SlidersHorizontal size={19} aria-hidden="true" /><h2>Challenge phase</h2><span class="badge badge-live">{data.config.phase}</span></div><p class="body-copy">Public evaluation accepts uploads and shows each team’s best result. Freeze submissions to capture a deadline, then publish the final selection based on the latest submission before freezing.</p><form method="POST" action="?/phase" use:enhance class="phase-form"><label for="phase">Evaluation phase</label><select name="phase" id="phase" value={data.config.phase}><option value="public">Public — accept submissions</option><option value="frozen">Frozen — stop submissions</option><option value="final">Final — publish final selection</option></select><button class="button button-primary" type="submit">Update phase</button></form></section>
<section class="panel content-management">
  <div class="panel-heading"><FileText size={19} aria-hidden="true" /><h2>Challenge content</h2><span class="badge badge-neutral">Files & Markdown</span></div>
  <p class="body-copy">Edit <code>challenge.json</code> to update the title, description, hero text, resource links, and documentation navigation. The overview body and information pages are Markdown files in the challenge directory.</p>
  <p class="field-help">Markdown edits appear after a page reload. JSON changes need validation and a web service restart; startup reseeds the configuration. Run <code>npm run content:check</code> before publishing and use the previews below to review the pages.</p>
  <div class="content-files">
    {#each data.contentFiles as file}
      <div class="content-file-row"><span class="content-file-icon"><FolderOpen size={17} aria-hidden="true" /></span><div><strong>{file.title}</strong><code>{file.source}</code></div><a class="button button-small button-secondary" href={file.href} target="_blank" rel="noreferrer">Preview<ArrowUpRight size={13} aria-hidden="true" /></a></div>
    {/each}
  </div>
</section>
<section class="table-panel"><div class="table-toolbar"><div><Activity size={19} aria-hidden="true" /><strong>Evaluation jobs</strong><span class="badge badge-neutral">{data.jobs.length} recent</span></div><button class="button button-small button-secondary" type="button" onclick={() => invalidateAll()}><RefreshCw size={14} aria-hidden="true" />Refresh</button></div>{#if data.jobs.length}<div class="table-scroll"><table><thead><tr><th>Submission</th><th>Team</th><th>Status</th><th>Attempt</th><th>Created</th><th></th></tr></thead><tbody>{#each data.jobs as job}<tr><td><code class="job-id">{job.id.slice(0, 8)}</code>{#if job.error}<small class="submission-error">{job.error}</small>{/if}</td><td>{job.teamName}</td><td><StatusBadge status={job.status} /></td><td>{job.attempt}</td><td class="muted nowrap">{new Date(job.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</td><td>{#if job.status === 'failed'}<form method="POST" action="?/retry" use:enhance><input type="hidden" name="id" value={job.id} /><button class="button button-small button-secondary" type="submit"><RefreshCw size={13} aria-hidden="true" />Retry</button></form>{/if}</td></tr>{/each}</tbody></table></div>{:else}<div class="empty-state compact"><span class="empty-icon"><Clock3 size={28} aria-hidden="true" /></span><h3>No evaluation jobs yet</h3><p>Uploaded submissions will appear here when they enter the queue.</p></div>{/if}</section>

