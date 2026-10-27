import { redirect } from '@sveltejs/kit';
import { configs } from '#lib/server/challenges.js';

export function load() { redirect(303, configs.length === 1 ? `/challenges/${configs[0].slug}` : '/challenges'); }
