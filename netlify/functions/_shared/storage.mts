import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env, isProduction } from './config.mts'

const LOCAL_ROOT = path.resolve(process.cwd(), '.netlify-local-data')
const USER_TABLE = 'yijian_users'
const OTP_TABLE = 'yijian_otp_challenges'
const SESSION_TABLE = 'yijian_sessions'

type JsonValue = Record<string, unknown> | Array<unknown> | string | number | boolean | null
type StorageProvider = 'supabase' | 'local'

type UserRow = {
  id: string
  email: string
  password_hash: string | null
  email_verified_at: string | null
  created_at: string
  updated_at: string
}

type OtpRow = {
  email: string
  purpose: string
  code_hash: string
  sent_at: string
  expires_at: string
  attempts: number
  window_started_at: string
  sent_count: number
  used_at: string | null
}

type SessionRow = {
  token_hash: string
  user_id: string
  expires_at: string
}

export type StoredUser = {
  id: string
  email: string
  passwordHash?: string
  emailVerifiedAt?: string
  createdAt: string
  updatedAt: string
}

export type StoredOtp = {
  hash: string
  sentAt: number
  expiresAt: number
  attempts: number
  windowStartedAt: number
  sentCount: number
  usedAt?: number
}

export type StoredSession = {
  userId: string
  expiresAt: number
}

function provider(): StorageProvider {
  return (env('STORAGE_PROVIDER', isProduction() ? 'supabase' : 'local') ?? 'local').toLowerCase() === 'supabase' ? 'supabase' : 'local'
}

export function usesSupabaseStorage(): boolean {
  return provider() === 'supabase'
}

function localFile(key: string): string {
  const encoded = Buffer.from(key, 'utf8').toString('base64url')
  return path.join(LOCAL_ROOT, `${encoded}.json`)
}

async function readLocal<T>(key: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(localFile(key), 'utf8')) as T
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

async function writeLocal(key: string, data: JsonValue): Promise<void> {
  await mkdir(LOCAL_ROOT, { recursive: true })
  await writeFile(localFile(key), JSON.stringify(data), 'utf8')
}

async function deleteLocal(key: string): Promise<void> {
  try {
    await unlink(localFile(key))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

function supabase(): SupabaseClient {
  const url = env('SUPABASE_URL')?.trim()
  const secret = (env('SUPABASE_SECRET') ?? env('SUPABASE_SECRET_KEY') ?? env('SUPABASE_SERVICE_ROLE_KEY'))?.trim()
  if (!url || !secret) throw new Error('Supabase 环境变量未配置完整')
  return createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } })
}

function userFromRow(row: UserRow): StoredUser {
  return {
    id: row.id,
    email: row.email,
    ...(row.password_hash ? { passwordHash: row.password_hash } : {}),
    ...(row.email_verified_at ? { emailVerifiedAt: row.email_verified_at } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function otpFromRow(row: OtpRow): StoredOtp {
  return {
    hash: row.code_hash,
    sentAt: Date.parse(row.sent_at),
    expiresAt: Date.parse(row.expires_at),
    attempts: Number(row.attempts),
    windowStartedAt: Date.parse(row.window_started_at),
    sentCount: Number(row.sent_count),
    ...(row.used_at ? { usedAt: Date.parse(row.used_at) } : {}),
  }
}

function sessionFromRow(row: SessionRow): StoredSession {
  return { userId: row.user_id, expiresAt: Date.parse(row.expires_at) }
}

export async function readUserByEmail(email: string): Promise<StoredUser | null> {
  if (provider() === 'local') return readLocal<StoredUser>(`user:email:${email}`)
  const { data, error } = await supabase().from(USER_TABLE).select('id,email,password_hash,email_verified_at,created_at,updated_at').eq('email', email).maybeSingle()
  if (error) throw error
  return data ? userFromRow(data as UserRow) : null
}

export async function readUserById(id: string): Promise<StoredUser | null> {
  if (provider() === 'local') return readLocal<StoredUser>(`user:id:${id}`)
  const { data, error } = await supabase().from(USER_TABLE).select('id,email,password_hash,email_verified_at,created_at,updated_at').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? userFromRow(data as UserRow) : null
}

export async function saveUser(user: StoredUser): Promise<void> {
  if (provider() === 'local') {
    await writeLocal(`user:email:${user.email}`, user)
    await writeLocal(`user:id:${user.id}`, user)
    return
  }
  const { error } = await supabase().from(USER_TABLE).insert({
    id: user.id,
    email: user.email,
    password_hash: user.passwordHash ?? null,
    email_verified_at: user.emailVerifiedAt ?? user.createdAt,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
  })
  if (error) throw error
}

export async function readOtp(email: string, purpose: string): Promise<StoredOtp | null> {
  if (provider() === 'local') return readLocal<StoredOtp>(`otp:${purpose}:${email}`)
  const { data, error } = await supabase().from(OTP_TABLE).select('email,purpose,code_hash,sent_at,expires_at,attempts,window_started_at,sent_count,used_at').eq('email', email).eq('purpose', purpose).maybeSingle()
  if (error) throw error
  return data ? otpFromRow(data as OtpRow) : null
}

export async function writeOtp(email: string, purpose: string, record: StoredOtp): Promise<void> {
  if (provider() === 'local') {
    await writeLocal(`otp:${purpose}:${email}`, record)
    return
  }
  const { error } = await supabase().from(OTP_TABLE).upsert({
    email,
    purpose,
    code_hash: record.hash,
    sent_at: new Date(record.sentAt).toISOString(),
    expires_at: new Date(record.expiresAt).toISOString(),
    attempts: record.attempts,
    window_started_at: new Date(record.windowStartedAt).toISOString(),
    sent_count: record.sentCount,
    used_at: null,
  }, { onConflict: 'email,purpose' })
  if (error) throw error
}

export async function incrementOtpAttempts(email: string, purpose: string, expectedAttempts: number): Promise<boolean> {
  if (provider() === 'local') {
    const key = `otp:${purpose}:${email}`
    const current = await readLocal<StoredOtp>(key)
    if (!current || current.attempts !== expectedAttempts) return false
    await writeLocal(key, { ...current, attempts: current.attempts + 1 })
    return true
  }
  const { data, error } = await supabase().from(OTP_TABLE).update({ attempts: expectedAttempts + 1 }).eq('email', email).eq('purpose', purpose).eq('attempts', expectedAttempts).is('used_at', null).select('email').limit(1)
  if (error) throw error
  return Boolean(data?.length)
}

export async function consumeOtp(email: string, purpose: string, expectedHash: string): Promise<boolean> {
  if (provider() === 'local') {
    const key = `otp:${purpose}:${email}`
    const current = await readLocal<StoredOtp>(key)
    if (!current || current.hash !== expectedHash || current.usedAt) return false
    await deleteLocal(key)
    return true
  }
  const now = new Date().toISOString()
  const { data, error } = await supabase().from(OTP_TABLE).update({ used_at: now }).eq('email', email).eq('purpose', purpose).eq('code_hash', expectedHash).is('used_at', null).gt('expires_at', now).select('email').limit(1)
  if (error) throw error
  return Boolean(data?.length)
}

export async function readSession(tokenHash: string): Promise<StoredSession | null> {
  if (provider() === 'local') return readLocal<StoredSession>(`session:${tokenHash}`)
  const { data, error } = await supabase().from(SESSION_TABLE).select('token_hash,user_id,expires_at').eq('token_hash', tokenHash).maybeSingle()
  if (error) throw error
  return data ? sessionFromRow(data as SessionRow) : null
}

export async function writeSession(tokenHash: string, session: StoredSession): Promise<void> {
  if (provider() === 'local') {
    await writeLocal(`session:${tokenHash}`, session)
    return
  }
  const { error } = await supabase().from(SESSION_TABLE).upsert({
    token_hash: tokenHash,
    user_id: session.userId,
    expires_at: new Date(session.expiresAt).toISOString(),
  }, { onConflict: 'token_hash' })
  if (error) throw error
}

export async function deleteSession(tokenHash: string): Promise<void> {
  if (provider() === 'local') {
    await deleteLocal(`session:${tokenHash}`)
    return
  }
  const { error } = await supabase().from(SESSION_TABLE).delete().eq('token_hash', tokenHash)
  if (error) throw error
}

export function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '23505')
}