<script lang="ts">
  import { ArrowRight, Binary, Dna, ScanLine } from 'lucide-svelte';
</script>

<div class="sequence-diagram" aria-label="Recover a DNA sequence from its embedding and compare your reconstruction with a reference">
  <div class="diagram-caption"><span class="small-caps">THE RECONSTRUCTION TASK</span><span class="diagram-note">Sequence → representation → sequence</span></div>
  <div class="diagram-flow">
    <div class="diagram-stage"><span class="diagram-icon"><Dna size={23} aria-hidden="true" /></span><span class="diagram-title">Original DNA</span><div class="dna-string"><b>A</b><i>C</i><em>G</em><strong>T</strong><b>A</b><em>G</em><i>C</i><strong>T</strong></div><span class="diagram-detail">Reference sequence</span></div>
    <ArrowRight class="diagram-arrow" size={21} aria-hidden="true" />
    <div class="diagram-stage"><span class="diagram-icon"><Binary size={23} aria-hidden="true" /></span><span class="diagram-title">Embedding</span><div class="embedding-bars" aria-hidden="true">{#each [35, 70, 48, 95, 60, 28, 83, 55, 40, 75, 62, 90] as height}<span style="height: {height}%"></span>{/each}</div><span class="diagram-detail">Model representation</span></div>
    <ArrowRight class="diagram-arrow" size={21} aria-hidden="true" />
    <div class="diagram-stage"><span class="diagram-icon warm"><ScanLine size={23} aria-hidden="true" /></span><span class="diagram-title">Your reconstruction</span><div class="dna-string"><b>A</b><i>C</i><em>G</em><strong>T</strong><b>A</b><span class="mismatch">T</span><i>C</i><strong>T</strong></div><span class="diagram-detail">Measure recovery quality</span></div>
  </div>
  <div class="diagram-footer"><span><span class="legend-dot teal"></span>Sequence accuracy</span><span><span class="legend-dot amber"></span>Levenshtein similarity</span><span class="diagram-example">Illustrative task · synthetic fixture data</span></div>
</div>
