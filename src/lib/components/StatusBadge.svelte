<script lang="ts">
  import { CheckCircle2, CircleDashed, AlertCircle, LoaderCircle } from '@lucide/svelte';
  let { status }: { status: string } = $props();
  const labels: Record<string, string> = { uploading: 'Uploading', queued: 'Queued', validating: 'Validating', scoring: 'Scoring', completed: 'Completed', rejected: 'Rejected', failed: 'Failed', running: 'Processing' };
</script>

<span class="status-badge {status}">
  {#if status === 'completed'}<CheckCircle2 size={13} aria-hidden="true" />
  {:else if status === 'failed' || status === 'rejected'}<AlertCircle size={13} aria-hidden="true" />
  {:else if status === 'queued'}<CircleDashed size={13} aria-hidden="true" />
  {:else}<LoaderCircle size={13} class="spin" aria-hidden="true" />{/if}
  {labels[status] ?? status}
</span>
