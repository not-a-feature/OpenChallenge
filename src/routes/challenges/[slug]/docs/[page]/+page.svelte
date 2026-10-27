<script lang="ts">
  import { BookOpen, ArrowUpRight, CodeXml, ArrowRight, Download, FileArchive } from '@lucide/svelte';
  import { page } from '$app/state';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  let base = $derived(`/challenges/${data.config.slug}`);
</script>

<div class="page-heading"><div><p class="eyebrow">INFORMATION / DOCUMENTATION</p><h1>{data.title}</h1><p class="page-intro">{data.config.title} · {data.config.datasetVersion}</p></div></div>
<div class="docs-layout"><article class="panel prose">{@html data.html}</article><aside class="docs-aside"><div class="docs-aside-card"><span class="small-caps">IN THIS CHALLENGE</span>{#each data.config.docs as doc}<a class:active={page.params.page === doc.slug} href={`${base}/docs/${doc.slug}`}><BookOpen size={15} aria-hidden="true" />{doc.title}<ArrowRight size={13} aria-hidden="true" /></a>{/each}</div><div class="docs-aside-card"><span class="small-caps">RESEARCH RESOURCES</span>{#each data.config.links as link}<a href={link.url} target="_blank" rel="noreferrer"><ArrowUpRight size={15} aria-hidden="true" />{link.label}</a>{/each}</div><div class="docs-note"><FileArchive size={23} aria-hidden="true" /><strong>Ready to evaluate?</strong><p>Upload your CSV archive and follow validation and scoring from your submission history.</p><a class="text-link" href={`${base}/submit`}>Submit predictions <ArrowRight size={14} aria-hidden="true" /></a></div></aside></div>


