import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('getSupabaseAdmin', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
  })

  it('throws a clear error when env vars are missing', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    const { getSupabaseAdmin } = await import('../supabase')
    expect(() => getSupabaseAdmin()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/)
  })

  it('returns a client when env vars are present', async () => {
    const { getSupabaseAdmin } = await import('../supabase')
    const client = getSupabaseAdmin()
    expect(client).toBeTruthy()
  })
})
