<script lang="ts">
  import { ArrowRight, ArrowUpRight, BookOpen, Upload, Users, Database, Check, GitBranch, CircleDot, Github, Layers } from 'lucide-svelte';
  import SequenceDiagram from '#lib/components/SequenceDiagram.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  let config = $derived(data.config);
  let base = $derived('/challenges/' + config.slug);
  let illustration = $derived(config.home?.illustration ?? 'generic');
  let headline = $derived(config.home?.headline ?? config.title);
  let summary = $derived(config.home?.summary ?? config.description);
  let featuredLink = $derived(config.links[0]);
  let resourceLink = $derived(config.links.find((link) => link.url.includes('github.com')) ?? config.links[0]);
  let overviewDoc = $derived(config.docs.find((doc) => doc.slug === 'overview') ?? config.docs[0]);
  let dataDoc = $derived(config.docs.find((doc) => doc.slug === 'data') ?? config.docs[0]);
</script>

<div class="page-heading">
  <div><p class="eyebrow">RESEARCH BENCHMARK</p><h1>{config.title}</h1><p class="page-intro">{config.description}</p></div>
  <span class="badge badge-live"><span class="live-dot"></span>{config.phase === 'public' ? 'Public evaluation' : config.phase === 'frozen' ? 'Submissions frozen' : 'Final results'}</span>
</div>
<section class="hero-panel">
  <div class="hero-copy">
    <span class="hero-kicker"><span class="hero-kicker-dot"></span>PREDICTION & REPRODUCIBLE EVALUATION</span>
    <h2>{headline}</h2>
    <p>{summary}</p>
    <div class="hero-actions">
      <a class="button button-primary" href={data.user ? base + '/submit' : '/login'}><Upload size={17} aria-hidden="true" />{data.user ? 'Submit predictions' : 'Join the challenge'}<ArrowRight size={16} aria-hidden="true" /></a>
      {#if featuredLink}<a class="button button-hero" href={featuredLink.url} target="_blank" rel="noreferrer"><BookOpen size={16} aria-hidden="true" />{featuredLink.label}<ArrowUpRight size={14} aria-hidden="true" /></a>{/if}
    </div>
  </div>
  <div class="hero-visual" class:hero-visual-generic={illustration !== 'dna'} aria-hidden="true">
    <div class="orbit orbit-one"></div><div class="orbit orbit-two"></div>
    {#if illustration === 'dna'}<div class="helix">{#each Array(11) as _, index}<div class="helix-rung" style="--i: {index}"><span></span><b></b><i></i></div>{/each}</div><span class="visual-tag tag-top">[ 0.24, −0.81, 0.56, … ]</span><span class="visual-tag tag-bottom">ACGT · AGCT · TCGA</span><div class="visual-coordinate">01 / REPRESENTATION INVERSION</div>
    {:else}<span class="generic-hero-icon"><Layers size={76} strokeWidth={1} /></span><div class="visual-coordinate">PREDICT / EVALUATE / COMPARE</div>{/if}
  </div>
</section>
<div class="stats-grid">
  <div class="stat-card"><span class="stat-icon"><GitBranch size={19} aria-hidden="true" /></span><div><strong>{config.tracks.length}</strong><span>Evaluation tracks</span></div></div>
  <div class="stat-card"><span class="stat-icon"><Users size={19} aria-hidden="true" /></span><div><strong>{data.counts.teams}</strong><span>Registered teams</span></div></div>
  <div class="stat-card"><span class="stat-icon"><Upload size={19} aria-hidden="true" /></span><div><strong>{data.counts.submissions}</strong><span>Submissions</span></div></div>
  <div class="stat-card"><span class="stat-icon"><Check size={19} aria-hidden="true" /></span><div><strong>{data.counts.completed}</strong><span>Completed evaluations</span></div></div>
</div>
<div class="overview-columns">
  <section>
    <div class="section-title"><span class="section-icon"><BookOpen size={18} aria-hidden="true" /></span><h2>Background & objective</h2></div>
    {#if data.homeHtml}<div class="home-prose">{@html data.homeHtml}</div>
    {:else}<p class="body-copy">{config.description}</p><p class="body-copy">Choose an evaluation track and review the challenge’s dataset, participation rules, and scoring documentation before submitting your predictions.</p>{/if}
    {#if overviewDoc}<a class="text-link" href={base + '/docs/' + overviewDoc.slug}>Read the challenge documentation<ArrowRight size={15} aria-hidden="true" /></a>{/if}
  </section>
  <section class="getting-started">
    <div class="section-title"><span class="section-icon"><CircleDot size={18} aria-hidden="true" /></span><h2>Get started</h2></div>
    {#if dataDoc}<a href={base + '/docs/' + dataDoc.slug} class="step-link"><span class="step-number">01</span><span><strong>Explore the benchmark</strong><small>Tracks, data files, and prediction format</small></span><ArrowUpRight size={17} aria-hidden="true" /></a>{/if}
    <a href={base + '/team'} class="step-link"><span class="step-number">02</span><span><strong>Create or join a team</strong><small>Register your team before submitting</small></span><ArrowUpRight size={17} aria-hidden="true" /></a>
    <a href={base + '/submit'} class="step-link"><span class="step-number">03</span><span><strong>Submit your predictions</strong><small>Upload an archive and follow the evaluation</small></span><ArrowUpRight size={17} aria-hidden="true" /></a>
  </section>
</div>
{#if illustration === 'dna'}<SequenceDiagram />{/if}
<section class="tracks-section">
  <div class="section-title-row"><div class="section-title"><span class="section-icon"><GitBranch size={18} aria-hidden="true" /></span><h2>Evaluation tracks</h2></div>{#if dataDoc}<a class="text-link" href={base + '/docs/' + dataDoc.slug}>Data & formats <ArrowRight size={15} aria-hidden="true" /></a>{/if}</div>
  <div class="track-grid">{#each config.tracks as track, index}<a class="track-card" href={base + '/leaderboard?track=' + track.id}><div class="track-card-top"><span class="track-index">TRACK {String(index + 1).padStart(2, '0')}</span><ArrowUpRight size={18} aria-hidden="true" /></div><h3>{track.name}</h3><p>{track.model}</p><div class="track-tags"><span>{track.representation}</span><span>{track.sequenceLength} characters</span></div><div class="track-card-footer"><Database size={14} aria-hidden="true" />{track.expectedRows} {config.example ? 'synthetic' : 'reference'} rows</div></a>{/each}</div>
</section>
{#if resourceLink}<div class="resource-strip"><div>{#if resourceLink.url.includes('github.com')}<Github size={24} aria-hidden="true" />{:else}<BookOpen size={24} aria-hidden="true" />{/if}<span><strong>Challenge resources</strong><small>Explore the reference material provided by the challenge organizers.</small></span></div><a class="button button-secondary" href={resourceLink.url} target="_blank" rel="noreferrer">{resourceLink.label}<ArrowUpRight size={15} aria-hidden="true" /></a></div>{/if}


