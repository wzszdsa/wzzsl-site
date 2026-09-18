type NetlifyGlobalLike = { env: { get: (key: string) => string | undefined } }

declare const Netlify: NetlifyGlobalLike

export function env(name: string, fallback?: string): string | undefined {
  if (typeof Netlify !== 'undefined' && Netlify.env) {
    return Netlify.env.get(name) ?? fallback
  }
  return fallback
}

export function isProduction(): boolean {
  return env('CONTEXT') === 'production' || env('NODE_ENV') === 'production'
}