/** Authenticated JSON / multipart client. Token null = public (CMS, login). */
import { API_URL } from './config'

function germanMessage(status: number, message?: string): string {
  if (message && !/^this action is unauthorized\.?$/i.test(message) && message !== 'Unauthenticated.') {
    return message
  }
  if (status === 401) return 'Nicht angemeldet.'
  if (status === 403) return 'Keine Berechtigung für diese Aktion.'
  if (status === 404) return 'Nicht gefunden.'
  if (status === 429) return 'Zu viele Versuche. Bitte kurz warten.'
  return message || 'Fehler'
}

export async function api<T = unknown>(
  path: string,
  token: string | null,
  init: RequestInit = {},
): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers as Record<string, string> | undefined),
  }
  if (!isForm && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
  })
  const json = (await res.json().catch(() => ({}))) as { message?: string } & T
  if (!res.ok) {
    throw new Error(germanMessage(res.status, (json as { message?: string }).message))
  }
  return json
}

export function unwrapList<T>(payload: T[] | { data?: T[] } | undefined): T[] {
  if (Array.isArray(payload)) return payload
  return payload?.data ?? []
}
