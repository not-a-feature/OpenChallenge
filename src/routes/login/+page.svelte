<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { CodeXml, Landmark, ArrowRight, ShieldCheck, FlaskConical, AlertCircle, LoaderCircle, ArrowUpRight, Layers } from '@lucide/svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  let working = $state(false);
  let message = $state('');
  let challenge = $derived(data.challenge ?? data.challenges[0]);
  let teamUrl = $derived(challenge ? '/challenges/' + challenge.slug + '/team' : '/challenges');
  let resource = $derived(challenge?.links[0]);
  async function login(provider: string) {
    working = true; message = '';
    const response = await fetch(provider === 'demo' ? '/api/demo/login' : '/api/login/' + provider, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const result = await response.json();
    if (!response.ok) { message = result.message ?? 'Sign-in could not be completed. Please try again.'; working = false; return; }
    if (provider === 'demo') await goto(teamUrl, { invalidateAll: true });
    else window.location.assign(result.url);
  }
</script>

<div class="login-layout">
  <section class="login-context">
    <span class="eyebrow">RESEARCH CHALLENGE PORTAL</span>
    <h1>{challenge?.home?.headline ?? challenge?.title ?? 'Research challenges'}</h1>
    <p>{challenge?.description ?? 'Join a team, submit predictions, and explore reproducible evaluation workflows.'}</p>
    {#if resource}<a class="text-link" href={resource.url} target="_blank" rel="noreferrer">{resource.label}<ArrowUpRight size={15} aria-hidden="true" /></a>{/if}
    <div class="login-context-note"><ShieldCheck size={22} aria-hidden="true" /><span>Transparent evaluation.<br />Versioned datasets and scoring.</span></div>
  </section>
  <section class="panel login-card">
    <span class="login-mark">{#if challenge?.logo}<img src={challenge.logo} alt="" width="32" height="32" />{:else}<Layers size={30} strokeWidth={1.5} aria-hidden="true" />{/if}</span>
    <h2>Welcome to the challenge</h2><p>Sign in to create a team, upload predictions, and follow your results.</p>
    {#if data.user}<div class="alert alert-success"><ShieldCheck size={17} aria-hidden="true" />You are signed in as {data.user.name}.</div><a class="button button-primary login-button" href={teamUrl}>Continue to my team <ArrowRight size={16} aria-hidden="true" /></a>
    {:else}
      {#each data.loginProviders as provider}
        <button class={'button login-button ' + (provider.id === 'github' ? 'button-github' : 'button-secondary')} type="button" onclick={() => login(provider.id)} disabled={working || !provider.enabled}>
          {#if working}<LoaderCircle size={18} class="spin" aria-hidden="true" />{:else if provider.id === 'github'}<CodeXml size={20} aria-hidden="true" />{:else if provider.id === 'oidc'}<Landmark size={20} aria-hidden="true" />{:else}<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.13H3.07v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.41 13.91a6 6 0 0 1 0-3.82V7.5H3.07a10 10 0 0 0 0 9l3.34-2.59Z"/><path fill="#EA4335" d="M12 5.96c1.47 0 2.79.5 3.82 1.49l2.87-2.87A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.93 5.5l3.34 2.59C7.2 7.72 9.4 5.96 12 5.96Z"/></svg>{/if}
          Continue with {provider.label}<ArrowRight size={16} aria-hidden="true" />
        </button>
      {/each}
      {#if data.loginProviders.some((provider) => !provider.enabled)}<p class="field-help login-help">Unavailable sign-in methods require configuration by the portal organizer.</p>{/if}
      {#if data.demoMode}<div class="login-divider"><span>LOCAL DEMONSTRATION</span></div><button class="button button-secondary login-button" type="button" disabled={working} onclick={() => login('demo')}><FlaskConical size={18} aria-hidden="true" />Try the local demo <ArrowRight size={16} aria-hidden="true" /></button><p class="field-help login-help">Creates a local demo session for exploring team registration and uploads.</p>{/if}
    {/if}
    {#if message}<div class="alert alert-error" role="alert"><AlertCircle size={17} aria-hidden="true" />{message}</div>{/if}
    {#if page.url.searchParams.has('error') && !data.user}<div class="alert alert-error" role="alert"><AlertCircle size={17} aria-hidden="true" />Sign-in could not be completed. Try again or choose another provider.</div>{/if}
    <div class="login-policy"><ShieldCheck size={15} aria-hidden="true" /><span>Secure sessions · External identity · Team-based access</span></div>
  </section>
</div>
