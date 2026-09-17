/** Authenticated JSON client. Token null = public (CMS, login). */
import { API_URL } from './config'

export async function api<T = unknown>(
  path: string,
  token: string | null,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  })
  const json = (await res.json().catch(() => ({}))) as { message?: string } & T
  if (!res.ok) {
    throw new Error((json as { message?: string }).message || 'Fehler')
  }
  return json
}

export function unwrapList<T>(payload: T[] | { data?: T[] } | undefined): T[] {
  if (Array.isArray(payload)) return payload
  return payload?.data ?? []
}
