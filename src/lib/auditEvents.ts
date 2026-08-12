// Shared audit types + labels. Kept out of `audit.ts` (which is server-only)
// so the admin audit page's client component can import the labels.

export type AuditActor = 'admin' | 'system' | 'player'

// Canonical event types — the audit page's filter dropdown is built from this
// list, so new events must be registered here.
export const AUDIT_EVENT_TYPES: Record<string, string> = {
  'pick-submitted': 'Pick submitted',
  'pick-changed': 'Pick changed',
  'pick-auto-assigned': 'Pick auto-assigned',
  'player-eliminated': 'Player eliminated',
  'player-updated': 'Player updated',
  'player-deleted': 'Player deleted',
  'pin-regenerated': 'PIN regenerated',
  'players-imported': 'Players imported',
  'result-set': 'Result set',
  'results-synced': 'Results synced',
  'schedule-synced': 'Schedule synced',
  'week-activated': 'Week activated',
  'week-advanced': 'Week advanced',
  'broadcast-sent': 'Broadcast sent',
  'pool-reset': 'Pool reset',
}

export type AuditEventType = keyof typeof AUDIT_EVENT_TYPES

export interface AuditEntry {
  event_type: AuditEventType
  actor: AuditActor
  message: string
  player_id?: string | null
  player_name?: string | null
  details?: Record<string, unknown> | null
}

export interface AuditRow extends AuditEntry {
  id: string
  created_at: string
}
