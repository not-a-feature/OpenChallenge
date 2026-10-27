<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { Upload, FileArchive, ArrowRight, ShieldCheck, Check, AlertCircle, Info, LogIn, Users, Clock3, FileText, LoaderCircle } from '@lucide/svelte';
  import StatusBadge from '#lib/components/StatusBadge.svelte';
  import SubmissionPerformance from '#lib/components/SubmissionPerformance.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  let base = $derived(`/challenges/${data.config.slug}`);
  let trackId = $state('');
  let quotaExhausted = $derived(data.quota?.remaining === 0);
  let selectedFile = $state<File | null>(null);
  let sending = $state(false);
  let message = $state('');
  let success = $state('');
  let progress = $state(0);
  let fileInput = $state<HTMLInputElement>();
  let activeJobs = $derived(data.submissions.some((submission) => ['uploading', 'queued', 'validating', 'scoring', 'running'].includes(submission.status)));
  $effect(() => { if (!trackId && data.config.tracks.length) trackId = data.config.tracks[0].id; });
  $effect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void invalidateAll(); }, activeJobs ? 3000 : 10000);
    return () => window.clearInterval(timer);
  });
  function chooseFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    selectedFile = input.files?.[0] ?? null;
    message = ''; success = '';
    if (!selectedFile) return;
    if (!/\.(zip|tar\.gz|tgz|tar\.bz2|tar\.xz)$/i.test(selectedFile.name)) { message = 'Choose a ZIP or TAR archive containing one CSV file.'; selectedFile = null; input.value = ''; return; }
    if (selectedFile.size > data.config.maxUploadBytes) { message = `This file exceeds the ${(data.config.maxUploadBytes / 1024 / 1024).toFixed(0)} MB upload limit.`; selectedFile = null; input.value = ''; }
  }
  function upload(event: SubmitEvent) {
    event.preventDefault();
    if (!selectedFile || sending || quotaExhausted) return;
    sending = true; message = ''; success = ''; progress = 0;
    const body = new FormData(); body.append('file', selectedFile); body.append('trackId', trackId);
    const request = new XMLHttpRequest();
    request.open('POST', `/api/challenges/${data.config.slug}/submissions`);
    request.upload.onprogress = (event) => { if (event.lengthComputable) progress = Math.round(event.loaded / event.total * 100); };
    request.onload = async () => {
      sending = false;
      const result = (request.getResponseHeader('Content-Type')?.includes('application/json') ? JSON.parse(request.responseText) : { message: `The upload returned HTTP ${request.status}. Please try again.` }) as { id?: string; message?: string };
      if (request.status >= 200 && request.status < 300) { success = 'Submission received. Validation and scoring will start shortly.'; selectedFile = null; fileInput!.value = ''; }
      else message = result.message ?? 'The upload was rejected. Please check the file and try again.';
      await invalidateAll();
    };
    request.onerror = () => { sending = false; message = 'The upload could not reach the server. Please try again.'; };
    request.send(body);
  }
</script>

<div class="page-heading"><div><p class="eyebrow">WORKSPACE / EVALUATION</p><h1>Submit predictions</h1><p class="page-intro">Upload your reconstructed sequences. We will validate the archive and evaluate your predictions.</p></div><a class="button button-secondary" href={`${base}/docs/data`}><FileText size={16} aria-hidden="true" />File format</a></div>
<div class="submission-quota" aria-label="Daily team submission quota">
  <Clock3 size={19} aria-hidden="true" />
  <div><strong>{data.quota ? data.quota.remaining + ' / ' + data.quota.limit + ' submissions remaining today' : data.config.dailyLimit + ' submissions per team per day'}</strong><small>Shared across all tracks for each team · Resets at midnight UTC</small></div>
  {#if data.quota}<span class="badge badge-neutral">{data.quota.used} used</span>{/if}
</div>
{#if quotaExhausted}<div class="alert alert-warning" role="status"><Info size={17} aria-hidden="true" />Your team has reached today’s submission limit. Uploads will reopen at midnight UTC.</div>{/if}
{#if !data.user}<div class="panel prerequisite-panel"><span class="empty-icon"><LogIn size={29} aria-hidden="true" /></span><div><h2>Sign in to submit predictions</h2><p>Sign in, create or join a team, and choose an evaluation track.</p></div><a class="button button-primary" href="/login">Sign in <ArrowRight size={16} aria-hidden="true" /></a></div>{:else if !data.team}<div class="panel prerequisite-panel"><span class="empty-icon"><Users size={29} aria-hidden="true" /></span><div><h2>Set up your team first</h2><p>Submissions belong to a team. Create one or join with an invitation code.</p></div><a class="button button-primary" href={`${base}/team`}>Go to my team <ArrowRight size={16} aria-hidden="true" /></a></div>{:else}
<div class="submission-columns"><section class="panel upload-panel"><div class="panel-heading"><span class="section-icon"><Upload size={18} aria-hidden="true" /></span><h2>New submission</h2><span class="badge badge-neutral">{data.team.name}</span></div><form onsubmit={upload}><label for="track">Evaluation track</label><select id="track" bind:value={trackId} disabled={sending || quotaExhausted || data.config.phase !== 'public'}>{#each data.config.tracks as track}<option value={track.id}>{track.name} · {track.sequenceLength} bp</option>{/each}</select><p class="field-help">Your prediction IDs must match the selected track’s reference set.</p><label for="prediction-file" class="upload-dropzone" class:has-file={selectedFile !== null}><span class="upload-icon"><FileArchive size={29} strokeWidth={1.5} aria-hidden="true" /></span>{#if selectedFile}<strong>{selectedFile.name}</strong><span>{(selectedFile.size / 1024).toFixed(1)} KB · ready to upload</span>{:else}<strong>Choose your prediction archive</strong><span>ZIP or TAR containing a single two-column CSV</span><span class="choose-file-label">Browse files</span>{/if}<input bind:this={fileInput} id="prediction-file" type="file" accept=".zip,.tar.gz,.tgz,.tar.bz2,.tar.xz" onchange={chooseFile} disabled={sending || quotaExhausted || data.config.phase !== 'public'} /></label><div class="upload-limits"><span>Maximum {(data.config.maxUploadBytes / 1024 / 1024).toFixed(0)} MB</span><span>{data.config.dailyLimit} submissions / team / day</span></div>{#if data.config.phase !== 'public'}<div class="alert alert-warning"><Info size={17} aria-hidden="true" />Submissions are closed for this challenge phase.</div>{/if}{#if message}<div class="alert alert-error" role="alert"><AlertCircle size={17} aria-hidden="true" />{message}</div>{/if}{#if success}<div class="alert alert-success" role="status"><Check size={17} aria-hidden="true" />{success}</div>{/if}{#if sending}<div class="upload-progress"><span>Uploading {progress}%</span><progress value={progress} max="100">{progress}%</progress></div>{/if}<div class="form-footer"><span><ShieldCheck size={15} aria-hidden="true" />Files are validated before scoring</span><button class="button button-primary" type="submit" disabled={!selectedFile || sending || quotaExhausted || data.config.phase !== 'public'}>{#if sending}<LoaderCircle size={16} class="spin" aria-hidden="true" />Uploading…{:else}<Upload size={16} aria-hidden="true" />Submit predictions{/if}</button></div></form></section><aside class="submission-guide"><div class="section-title"><ShieldCheck size={19} aria-hidden="true" /><h2>Before you upload</h2></div><div class="check-item"><Check size={17} aria-hidden="true" /><p>One archive, one CSV file.<small>Safe subdirectories are allowed. Links, unsafe paths, and extra files are rejected.</small></p></div><div class="check-item"><Check size={17} aria-hidden="true" /><p>Exactly two columns.<small>Use the header <code>id,sequence</code>, followed by one row per ID.</small></p></div><div class="check-item"><Check size={17} aria-hidden="true" /><p>Complete, unique identifiers.<small>No duplicate, missing, or unexpected IDs.</small></p></div><div class="check-item"><Check size={17} aria-hidden="true" /><p>Preserve your prediction strings.<small>Strings are compared verbatim. Case, spacing, and character differences affect the scores.</small></p></div><div class="csv-example"><span>PREDICTIONS.CSV</span><pre>id,sequence&#10;seq_0001,ACGTACGT&#10;seq_0002,TGCATGCA</pre><small>Illustrative rows; use your track’s IDs and lengths.</small></div><a class="text-link" href={`${base}/docs/data`}>View datasets & examples <ArrowRight size={15} aria-hidden="true" /></a></aside></div>{/if}
{#if data.team}<SubmissionPerformance submissions={data.submissions} tracks={data.config.tracks} primaryMetric={data.config.primaryMetric} datasetVersion={data.config.datasetVersion} />{/if}
<section class="table-panel submissions-history"><div class="table-toolbar"><div><Clock3 size={18} aria-hidden="true" /><strong>Submission history</strong></div>{#if activeJobs}<span class="refresh-label"><span class="live-dot"></span>Checking every 3 seconds</span>{/if}</div>{#if data.submissions.length}<div class="table-scroll"><table><thead><tr><th>File</th><th>Track</th><th>Status</th><th class="numeric">Similarity</th><th>Submitted</th></tr></thead><tbody>{#each data.submissions as submission}<tr id={`submission-${submission.id}`}><td><div class="filename-cell"><FileArchive size={17} aria-hidden="true" /><strong>{submission.originalName}</strong></div>{#if submission.error}<small class="submission-error">{submission.error}</small>{/if}</td><td>{data.config.tracks.find((track) => track.id === submission.trackId)?.name ?? submission.trackId}</td><td><StatusBadge status={submission.status} /></td><td class="numeric primary-score">{submission.metrics ? `${(submission.metrics.levenshtein_similarity * 100).toFixed(2)}%` : '—'}</td><td class="muted nowrap">{new Date(submission.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</td></tr>{/each}</tbody></table></div>{:else}<div class="empty-state compact"><span class="empty-icon"><FileArchive size={27} aria-hidden="true" /></span><h3>No submissions yet</h3><p>Your team’s uploads and evaluation results will appear here.</p></div>{/if}</section>




