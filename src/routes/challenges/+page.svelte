<script lang="ts">
  import { ArrowRight, Dna, Layers, GitBranch, ArrowUpRight } from 'lucide-svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<div class="page-heading"><div><p class="eyebrow">RESEARCH BENCHMARKS</p><h1>Explore challenges</h1><p class="page-intro">A shared home for independent research challenges, teams, and evaluation workflows.</p></div><span class="badge badge-neutral"><Layers size={14} aria-hidden="true" />{data.challenges.length} challenge{data.challenges.length === 1 ? '' : 's'}</span></div>
<div class="challenge-grid">{#each data.challenges as challenge}<a class="panel challenge-card" href={`/challenges/${challenge.slug}`}><div class="challenge-card-top"><span class="form-heading-icon">{#if challenge.example && challenge.slug === 'dna-inversion'}<Dna size={28} aria-hidden="true" />{:else}<Layers size={28} aria-hidden="true" />{/if}</span></div><h2>{challenge.title}</h2><p>{challenge.description}</p><div class="challenge-card-meta"><span><GitBranch size={15} aria-hidden="true" />{challenge.tracks.length} evaluation tracks</span><span>{challenge.datasetVersion}</span></div><div class="challenge-card-bottom"><strong>Explore challenge</strong><ArrowRight size={18} aria-hidden="true" /></div></a>{/each}</div>


