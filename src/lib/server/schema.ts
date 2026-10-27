import { boolean, integer, bigint, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid, index } from 'drizzle-orm/pg-core';
import type { ChallengeConfig } from './challenges';

export const user = pgTable('user', {
  id: text('id').primaryKey(), name: text('name').notNull(), email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false), image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});
export const session = pgTable('session', {
  id: text('id').primaryKey(), token: text('token').notNull().unique(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ip_address'), userAgent: text('user_agent')
});
export const account = pgTable('account', {
  id: text('id').primaryKey(), accountId: text('account_id').notNull(), providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'), refreshToken: text('refresh_token'), idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'), password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});
export const verification = pgTable('verification', {
  id: text('id').primaryKey(), identifier: text('identifier').notNull(), value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});
export const challenges = pgTable('challenges', {
  slug: text('slug').primaryKey(), title: text('title').notNull(), config: jsonb('config').$type<ChallengeConfig>().notNull(),
  phase: text('phase').notNull().default('public'), frozenAt: timestamp('frozen_at', { withTimezone: true })
});
export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(), challengeSlug: text('challenge_slug').notNull().references(() => challenges.slug),
  name: text('name').notNull(), ownerId: text('owner_id').notNull().references(() => user.id),
  inviteCode: text('invite_code').notNull().unique(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [unique('team_challenge_name').on(table.challengeSlug, table.name)]);
export const memberships = pgTable('memberships', {
  teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id), challengeSlug: text('challenge_slug').notNull().references(() => challenges.slug),
  role: text('role').notNull().default('member')
}, (table) => [primaryKey({ columns: [table.teamId, table.userId] }), unique('one_team_per_challenge').on(table.userId, table.challengeSlug)]);
export const submissions = pgTable('submissions', {
  id: uuid('id').primaryKey(), challengeSlug: text('challenge_slug').notNull().references(() => challenges.slug),
  trackId: text('track_id').notNull(), teamId: uuid('team_id').notNull().references(() => teams.id),
  userId: text('user_id').notNull().references(() => user.id), originalName: text('original_name').notNull(),
  storageName: text('storage_name').notNull(), sha256: text('sha256').notNull(), bytes: bigint('bytes', { mode: 'number' }).notNull(),
  status: text('status').notNull(), attempt: integer('attempt').notNull().default(0), claimedBy: uuid('claimed_by'),
  leaseUntil: timestamp('lease_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }), completedAt: timestamp('completed_at', { withTimezone: true }),
  metrics: jsonb('metrics').$type<Record<string, number>>(), error: text('error'),
  evaluatorVersion: text('evaluator_version'), datasetVersion: text('dataset_version').notNull()
}, (table) => [index('pending_jobs').on(table.status, table.createdAt), index('team_quota').on(table.teamId, table.createdAt)]);
export const auditEvents = pgTable('audit_events', {
  id: uuid('id').primaryKey().defaultRandom(), actorId: text('actor_id').notNull().references(() => user.id),
  challengeSlug: text('challenge_slug').notNull().references(() => challenges.slug), action: text('action').notNull(),
  detail: jsonb('detail').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});
