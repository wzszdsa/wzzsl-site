const configuredBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '')

export type ApiResult<T> = {
  response: Response
  data: T | null
}

export function apiUrl(path: string): string {
  return `${configuredBaseUrl}${path}`
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json')

  const response = await fetch(apiUrl(path), {
    ...init,
    headers,
    credentials: init.credentials ?? 'include',
  })
  const contentType = response.headers.get('content-type') ?? ''
  const data = contentType.includes('application/json')
    ? await response.json().catch(() => null) as T | null
    : null
  return { response, data }
}