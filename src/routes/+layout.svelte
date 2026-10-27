<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { Dna, House, BookOpen, Database, ShieldCheck, Trophy, Upload, Users, Github, ArrowUpRight, ChevronDown, Menu, X, Layers, SlidersHorizontal, LogOut, LogIn, FlaskConical, PanelLeftClose, PanelLeftOpen, GripVertical } from 'lucide-svelte';
  import type { LayoutData } from './$types';
  import type { Snippet } from 'svelte';
  let { data, children }: { data: LayoutData; children: Snippet } = $props();
  let mobileOpen = $state(false);
  let logoutError = $state('');
  const defaultWidth = 252;
  const minWidth = 200;
  const maxWidth = 380;
  const collapsedWidth = 68;
  let sidebarWidth = $state(defaultWidth);
  let sidebarCollapsed = $state(false);
  let resizeStartX = 0;
  let resizeStartWidth = defaultWidth;
  let resizePointerId = $state<number | null>(null);
  const docIcons: Record<string, typeof BookOpen> = { overview: BookOpen, data: Database, rules: ShieldCheck, scoring: FlaskConical };
  let challenge = $derived(data.challenge ?? data.challenges[0]);
  let base = $derived(challenge ? '/challenges/' + challenge.slug : '/challenges');
  let nav = $derived([
    { label: 'Overview', href: base, icon: House },
    ...(challenge?.docs ?? []).map((doc) => ({ label: doc.title, href: base + '/docs/' + doc.slug, icon: docIcons[doc.slug] ?? BookOpen }))
  ]);
  let workspace = $derived([
    { label: 'Leaderboard', href: base + '/leaderboard', icon: Trophy },
    { label: 'Submit predictions', href: base + '/submit', icon: Upload },
    { label: 'My team', href: base + '/team', icon: Users }
  ]);
  let currentLabel = $derived([...nav, ...workspace, { label: 'Organizer console', href: base + '/admin' }].find((item) => item.href === page.url.pathname)?.label ?? (page.url.pathname === '/login' ? 'Sign in' : 'Challenges'));
  function clampWidth(value: number) { return Math.round(Math.min(maxWidth, Math.max(minWidth, value))); }
  function saveSidebar() {
    window.localStorage.setItem('challenge-portal.sidebarWidth', String(sidebarWidth));
    window.localStorage.setItem('challenge-portal.sidebarCollapsed', String(sidebarCollapsed));
  }
  onMount(() => {
    const savedWidth = Number(window.localStorage.getItem('challenge-portal.sidebarWidth') ?? defaultWidth);
    if (Number.isFinite(savedWidth)) sidebarWidth = clampWidth(savedWidth);
    sidebarCollapsed = window.localStorage.getItem('challenge-portal.sidebarCollapsed') === 'true';
  });
  function toggleSidebar() { sidebarCollapsed = !sidebarCollapsed; saveSidebar(); }
  function startResize(event: PointerEvent) {
    if (event.button !== 0 || sidebarCollapsed) return;
    event.preventDefault();
    resizeStartX = event.clientX;
    resizeStartWidth = sidebarWidth;
    resizePointerId = event.pointerId;
    (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
  }
  function moveResize(event: PointerEvent) {
    if (event.pointerId !== resizePointerId) return;
    const width = resizeStartWidth + event.clientX - resizeStartX;
    if (width <= (minWidth + collapsedWidth) / 2) {
      sidebarWidth = resizeStartWidth;
      sidebarCollapsed = true;
      finishResize(event);
    } else sidebarWidth = clampWidth(width);
  }
  function finishResize(event: PointerEvent) {
    if (event.pointerId !== resizePointerId) return;
    resizePointerId = null;
    const handle = event.currentTarget as HTMLDivElement;
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    saveSidebar();
  }
  function lostResizeCapture() { resizePointerId = null; }
  function resetWidth() { sidebarWidth = defaultWidth; saveSidebar(); }
  function keyboardResize(event: KeyboardEvent) {
    const step = event.shiftKey ? 20 : 8;
    switch (event.key) {
      case 'ArrowLeft': sidebarWidth = clampWidth(sidebarWidth - step); break;
      case 'ArrowRight': sidebarWidth = clampWidth(sidebarWidth + step); break;
      case 'Home': sidebarWidth = minWidth; break;
      case 'End': sidebarWidth = maxWidth; break;
      case 'Enter': sidebarWidth = defaultWidth; break;
      default: return;
    }
    event.preventDefault();
    saveSidebar();
  }
  function handleWindowKey(event: KeyboardEvent) { if (event.key === 'Escape') mobileOpen = false; }
  async function logout() {
    logoutError = '';
    const response = await fetch('/api/logout', { method: 'POST' });
    if (!response.ok) { logoutError = 'Could not sign out. Please try again.'; return; }
    await goto('/login', { invalidateAll: true });
  }
</script>

<svelte:head><title>{currentLabel} · {challenge?.shortTitle ?? 'OpenChallenge'}</title><meta name="description" content={challenge?.description ?? 'Explore research benchmarks, submit predictions, and compare results.'} /></svelte:head>
<svelte:window onkeydown={handleWindowKey} />

<div class="portal-shell" class:sidebar-collapsed={sidebarCollapsed} class:is-resizing={resizePointerId !== null} style={'--sidebar-width: ' + (sidebarCollapsed ? collapsedWidth : sidebarWidth) + 'px;'} >
  <a href="#main-content" class="skip-link">Skip to content</a>
  {#if mobileOpen}<button class="sidebar-backdrop" aria-label="Close navigation" onclick={() => mobileOpen = false}></button>{/if}
  <aside id="challenge-navigation" class:mobile-open={mobileOpen} class="sidebar">
    <a class="brand" href={base} aria-label={(challenge?.shortTitle ?? 'OpenChallenge') + ' overview'} title={challenge?.shortTitle ?? 'OpenChallenge'} onclick={() => mobileOpen = false}><span class="brand-mark">{#if challenge?.slug === 'dna-inversion' && challenge.example}<Dna size={27} strokeWidth={1.7} aria-hidden="true" />{:else}<Layers size={25} strokeWidth={1.7} aria-hidden="true" />{/if}</span><span class="brand-copy"><strong>{challenge?.shortTitle ?? 'OpenChallenge'}</strong><small>RESEARCH CHALLENGE</small></span></a>
    <a class="challenge-switcher" href="/challenges" aria-label="Explore challenges" title="Explore challenges"><Layers size={15} aria-hidden="true" /><span class="switcher-label">Explore challenges</span><ChevronDown class="switcher-arrow" size={14} aria-hidden="true" /></a>
    <nav aria-label="Main navigation">
      <div class="nav-group-label">Information</div>
      {#each nav as item}<a href={item.href} aria-label={item.label} title={item.label} class:active={page.url.pathname === item.href} aria-current={page.url.pathname === item.href ? 'page' : undefined} onclick={() => mobileOpen = false}><item.icon size={17} strokeWidth={1.7} aria-hidden="true" /><span class="nav-item-label">{item.label}</span>{#if page.url.pathname === item.href}<span class="active-dot"></span>{/if}</a>{/each}
      <div class="nav-group-label workspace-label">Workspace</div>
      {#each workspace as item}<a href={item.href} aria-label={item.label} title={item.label} class:active={page.url.pathname === item.href} aria-current={page.url.pathname === item.href ? 'page' : undefined} onclick={() => mobileOpen = false}><item.icon size={17} strokeWidth={1.7} aria-hidden="true" /><span class="nav-item-label">{item.label}</span>{#if page.url.pathname === item.href}<span class="active-dot"></span>{/if}</a>{/each}
      {#if data.isAdmin}<div class="nav-group-label workspace-label">Organization</div><a href={base + '/admin'} aria-label="Organizer console" title="Organizer console" class:active={page.url.pathname.endsWith('/admin')} onclick={() => mobileOpen = false}><SlidersHorizontal size={17} aria-hidden="true" /><span class="nav-item-label">Organizer console</span></a>{/if}
    </nav>
    <div class="sidebar-bottom">
      <div class="sidebar-resources"><span class="nav-group-label">Research resources</span>{#each challenge?.links ?? [] as link}<a href={link.url} aria-label={link.label} title={link.label} target="_blank" rel="noreferrer">{#if link.url.includes('github.com')}<Github size={15} aria-hidden="true" />{:else}<BookOpen size={15} aria-hidden="true" />{/if}<span class="resource-label">{link.label}</span><ArrowUpRight class="resource-arrow" size={14} aria-hidden="true" /></a>{/each}</div>
      {#if data.user}<div class="user-card"><span class="avatar" title={data.user.name}>{data.user.name.slice(0, 1).toUpperCase()}</span><span class="user-info"><strong>{data.user.name}</strong><small>{data.isAdmin ? 'Organizer' : 'Participant'}</small></span><button class="icon-button" aria-label="Sign out" title="Sign out" onclick={logout}><LogOut size={17} aria-hidden="true" /></button></div>{:else}<a class="sidebar-login" href="/login" aria-label="Sign in" title="Sign in"><LogIn size={18} aria-hidden="true" /><span class="login-copy"><strong>Sign in</strong><small>Join a team to participate</small></span><ArrowUpRight class="login-arrow" size={16} aria-hidden="true" /></a>{/if}
      {#if logoutError}<p class="sidebar-error" role="alert">{logoutError}</p>{/if}
      <div class="sidebar-controls"><button class="sidebar-collapse-button" type="button" aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!sidebarCollapsed} aria-controls="challenge-navigation" onclick={toggleSidebar}>{#if sidebarCollapsed}<PanelLeftOpen size={17} aria-hidden="true" />{:else}<PanelLeftClose size={17} aria-hidden="true" /><span>Collapse sidebar</span>{/if}</button></div>
      <div class="sidebar-footnote"><span>OpenChallenge</span><span>Scaffold v0.1</span></div>
    </div>
  </aside>
  {#if !sidebarCollapsed}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (The WAI-ARIA adjustable window splitter is a focusable separator with value and keyboard controls.) -->
    <div class="sidebar-resizer" role="separator" tabindex="0" aria-label="Resize sidebar. Arrow keys adjust width; Enter resets." aria-orientation="vertical" aria-controls="challenge-navigation" aria-valuemin={minWidth} aria-valuemax={maxWidth} aria-valuenow={sidebarWidth} aria-valuetext={sidebarWidth + ' pixels'} title="Drag to resize. Arrow keys adjust; double-click or Enter resets." onpointerdown={startResize} onpointermove={moveResize} onpointerup={finishResize} onpointercancel={finishResize} onlostpointercapture={lostResizeCapture} onkeydown={keyboardResize} ondblclick={resetWidth}><span><GripVertical size={13} aria-hidden="true" /></span></div>{/if}
  <div class="app-main">
    <header class="topbar"><div class="breadcrumb"><button class="mobile-toggle" aria-label={mobileOpen ? 'Close menu' : 'Open menu'} aria-expanded={mobileOpen} aria-controls="challenge-navigation" onclick={() => mobileOpen = !mobileOpen}>{#if mobileOpen}<X size={21} aria-hidden="true" />{:else}<Menu size={21} aria-hidden="true" />{/if}</button><span class="breadcrumb-parent">{challenge?.shortTitle ?? 'OpenChallenge'}</span><span class="breadcrumb-divider">/</span><span>{currentLabel}</span></div></header>
    <main id="main-content" class="content">{@render children()}</main>
  </div>
</div>




