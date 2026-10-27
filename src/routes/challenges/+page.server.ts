import { configs, publicConfig } from '#lib/server/challenges.js';
export function load() { return { challenges: configs.map(publicConfig) }; }
