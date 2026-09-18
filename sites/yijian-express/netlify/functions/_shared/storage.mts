import path from 'node:path'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { createPool, type Pool, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env, isProduction } from './config.mts'

const LOCAL_ROOT = path.resolve(process.cwd(), '.netlify-local-data')
const USER_TABLE = 'yijian_users'
const OTP_TABLE = 'yijian_otp_challenges'
const SESSION_TABLE = 'yijian_sessions'

type JsonValue = Record<string, unknown> | Array<unknown> | string | number | boolean | null
type StorageProvider = 'mysql' | 'supabase' | 'local'

type UserRow = {
  id: string
  email: string
  password_hash: string | null
  email_verified_at: string | null
  created_at: string
  updated_at: string
  password_set_at: string | null
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

type MysqlUserRow = UserRow & RowDataPacket
type MysqlOtpRow = OtpRow & RowDataPacket
type MysqlSessionRow = SessionRow & RowDataPacket

export type StoredUser = {
  id: string
  email: string
  passwordHash?: string
  emailVerifiedAt?: string
  createdAt: string
  updatedAt: string
  passwordSetAt?: string
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

let mysqlPoolInstance: Pool | undefined

function provider(): StorageProvider {
  const configured = (env('STORAGE_PROVIDER', isProduction() ? 'supabase' : 'local') ?? 'local').trim().toLowerCase()
  if (configured === 'mysql' || configured === 'supabase') return configured
  return 'local'
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

function mysqlPool(): Pool {
  if (mysqlPoolInstance) return mysqlPoolInstance

  const connectionUrl = (env('MYSQL_URL') ?? env('DATABASE_URL'))?.trim()
  if (!connectionUrl) throw new Error('MySQL_URL 或 DATABASE_URL 未配置')

  let parsed: URL
  try {
    parsed = new URL(connectionUrl)
  } catch {
    throw new Error('MySQL_URL 格式不正确，应为 mysql://用户名:密码@主机:端口/数据库')
  }
  if (parsed.protocol !== 'mysql:' && parsed.protocol !== 'mysqls:') {
    throw new Error('MySQL_URL 必须使用 mysql:// 或 mysqls://')
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''))
  if (!parsed.hostname || !parsed.username || !database) {
    throw new Error('MySQL_URL 必须包含主机、用户名和数据库名')
  }

  const connectionLimit = Number(env('MYSQL_CONNECTION_LIMIT', '4') ?? '4')
  mysqlPoolInstance = createPool({
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database,
    waitForConnections: true,
    connectionLimit: Number.isFinite(connectionLimit) && connectionLimit > 0 ? connectionLimit : 4,
    queueLimit: 0,
    enableKeepAlive: true,
    dateStrings: true,
    timezone: 'Z',
    ...(parsed.protocol === 'mysqls:' || env('MYSQL_SSL') === 'true'
      ? { ssl: { rejectUnauthorized: true } }
      : {}),
  })
  return mysqlPoolInstance
}

function parseDatabaseDate(value: string): number {
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`
  return Date.parse(normalized)
}

function userFromRow(row: UserRow): StoredUser {
  return {
    id: row.id,
    email: row.email,
    ...(row.password_hash ? { passwordHash: row.password_hash } : {}),
    ...(row.email_verified_at ? { emailVerifiedAt: row.email_verified_at } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.password_set_at ? { passwordSetAt: row.password_set_at } : {}),
  }
}

function otpFromRow(row: OtpRow): StoredOtp {
  return {
    hash: row.code_hash,
    sentAt: parseDatabaseDate(row.sent_at),
    expiresAt: parseDatabaseDate(row.expires_at),
    attempts: Number(row.attempts),
    windowStartedAt: parseDatabaseDate(row.window_started_at),
    sentCount: Number(row.sent_count),
    ...(row.used_at ? { usedAt: parseDatabaseDate(row.used_at) } : {}),
  }
}

function sessionFromRow(row: SessionRow): StoredSession {
  return { userId: row.user_id, expiresAt: parseDatabaseDate(row.expires_at) }
}

export async function readUserByEmail(email: string): Promise<StoredUser | null> {
  if (provider() === 'local') return readLocal<StoredUser>(`user:email:${email}`)
  if (provider() === 'mysql') {
    const [rows] = await mysqlPool().query<MysqlUserRow[]>(
      'SELECT id,email,password_hash,email_verified_at,created_at,updated_at,password_set_at FROM yijian_users WHERE email = ? LIMIT 1',
      [email],
    )
    return rows[0] ? userFromRow(rows[0]) : null
  }
  const { data, error } = await supabase().from(USER_TABLE).select('id,email,password_hash,email_verified_at,created_at,updated_at,password_set_at').eq('email', email).maybeSingle()
  if (error) throw error
  return data ? userFromRow(data as UserRow) : null
}

export async function readUserById(id: string): Promise<StoredUser | null> {
  if (provider() === 'local') return readLocal<StoredUser>(`user:id:${id}`)
  if (provider() === 'mysql') {
    const [rows] = await mysqlPool().query<MysqlUserRow[]>(
      'SELECT id,email,password_hash,email_verified_at,created_at,updated_at,password_set_at FROM yijian_users WHERE id = ? LIMIT 1',
      [id],
    )
    return rows[0] ? userFromRow(rows[0]) : null
  }
  const { data, error } = await supabase().from(USER_TABLE).select('id,email,password_hash,email_verified_at,created_at,updated_at,password_set_at').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? userFromRow(data as UserRow) : null
}

export async function saveUser(user: StoredUser): Promise<void> {
  if (provider() === 'local') {
    await writeLocal(`user:email:${user.email}`, user)
    await writeLocal(`user:id:${user.id}`, user)
    return
  }
  if (provider() === 'mysql') {
    await mysqlPool().execute<ResultSetHeader>(
      'INSERT INTO yijian_users (id,email,password_hash,email_verified_at,created_at,updated_at,password_set_at) VALUES (?,?,?,?,?,?,?)',
      [user.id, user.email, user.passwordHash ?? null, user.emailVerifiedAt ?? user.createdAt, user.createdAt, user.updatedAt, user.passwordSetAt ?? (user.passwordHash ? user.updatedAt : null)],
    )
    return
  }
  const { error } = await supabase().from(USER_TABLE).insert({
    id: user.id,
    email: user.email,
    password_hash: user.passwordHash ?? null,
    email_verified_at: user.emailVerifiedAt ?? user.createdAt,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
    password_set_at: user.passwordSetAt ?? (user.passwordHash ? user.updatedAt : null),
  })
  if (error) throw error
}

export async function setUserPassword(userId: string, passwordHash: string, passwordSetAt: string): Promise<boolean> {
  if (provider() === 'local') {
    const user = await readLocal<StoredUser>(`user:id:${userId}`)
    if (!user || user.passwordHash) return false
    const next = { ...user, passwordHash, passwordSetAt, updatedAt: passwordSetAt }
    await writeLocal(`user:email:${user.email}`, next)
    await writeLocal(`user:id:${user.id}`, next)
    return true
  }
  if (provider() === 'mysql') {
    const [result] = await mysqlPool().execute<ResultSetHeader>(
      'UPDATE yijian_users SET password_hash = ?, password_set_at = ?, updated_at = ? WHERE id = ? AND password_hash IS NULL',
      [passwordHash, passwordSetAt, passwordSetAt, userId],
    )
    return result.affectedRows > 0
  }
  const { data, error } = await supabase().from(USER_TABLE).update({ password_hash: passwordHash, password_set_at: passwordSetAt, updated_at: passwordSetAt }).eq('id', userId).is('password_hash', null).select('id')
  if (error) throw error
  return Boolean(data?.length)
}

export async function readOtp(email: string, purpose: string): Promise<StoredOtp | null> {
  if (provider() === 'local') return readLocal<StoredOtp>(`otp:${purpose}:${email}`)
  if (provider() === 'mysql') {
    const [rows] = await mysqlPool().query<MysqlOtpRow[]>(
      'SELECT email,purpose,code_hash,sent_at,expires_at,attempts,window_started_at,sent_count,used_at FROM yijian_otp_challenges WHERE email = ? AND purpose = ? LIMIT 1',
      [email, purpose],
    )
    return rows[0] ? otpFromRow(rows[0]) : null
  }
  const { data, error } = await supabase().from(OTP_TABLE).select('email,purpose,code_hash,sent_at,expires_at,attempts,window_started_at,sent_count,used_at').eq('email', email).eq('purpose', purpose).maybeSingle()
  if (error) throw error
  return data ? otpFromRow(data as OtpRow) : null
}

export async function writeOtp(email: string, purpose: string, record: StoredOtp): Promise<void> {
  if (provider() === 'local') {
    await writeLocal(`otp:${purpose}:${email}`, record)
    return
  }
  if (provider() === 'mysql') {
    await mysqlPool().execute<ResultSetHeader>(
      `INSERT INTO yijian_otp_challenges
        (email,purpose,code_hash,sent_at,expires_at,attempts,window_started_at,sent_count,used_at)
       VALUES (?,?,?,?,?,?,?, ?, NULL)
       ON DUPLICATE KEY UPDATE
        code_hash = VALUES(code_hash), sent_at = VALUES(sent_at), expires_at = VALUES(expires_at),
        attempts = VALUES(attempts), window_started_at = VALUES(window_started_at),
        sent_count = VALUES(sent_count), used_at = NULL`,
      [email, purpose, record.hash, new Date(record.sentAt), new Date(record.expiresAt), record.attempts, new Date(record.windowStartedAt), record.sentCount],
    )
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
  if (provider() === 'mysql') {
    const [result] = await mysqlPool().execute<ResultSetHeader>(
      'UPDATE yijian_otp_challenges SET attempts = attempts + 1 WHERE email = ? AND purpose = ? AND attempts = ? AND used_at IS NULL',
      [email, purpose, expectedAttempts],
    )
    return result.affectedRows > 0
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
  if (provider() === 'mysql') {
    const [result] = await mysqlPool().execute<ResultSetHeader>(
      'UPDATE yijian_otp_challenges SET used_at = UTC_TIMESTAMP(3) WHERE email = ? AND purpose = ? AND code_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP(3)',
      [email, purpose, expectedHash],
    )
    return result.affectedRows > 0
  }
  const now = new Date().toISOString()
  const { data, error } = await supabase().from(OTP_TABLE).update({ used_at: now }).eq('email', email).eq('purpose', purpose).eq('code_hash', expectedHash).is('used_at', null).gt('expires_at', now).select('email').limit(1)
  if (error) throw error
  return Boolean(data?.length)
}

export async function readSession(tokenHash: string): Promise<StoredSession | null> {
  if (provider() === 'local') return readLocal<StoredSession>(`session:${tokenHash}`)
  if (provider() === 'mysql') {
    const [rows] = await mysqlPool().query<MysqlSessionRow[]>(
      'SELECT token_hash,user_id,expires_at FROM yijian_sessions WHERE token_hash = ? LIMIT 1',
      [tokenHash],
    )
    return rows[0] ? sessionFromRow(rows[0]) : null
  }
  const { data, error } = await supabase().from(SESSION_TABLE).select('token_hash,user_id,expires_at').eq('token_hash', tokenHash).maybeSingle()
  if (error) throw error
  return data ? sessionFromRow(data as SessionRow) : null
}

export async function writeSession(tokenHash: string, session: StoredSession): Promise<void> {
  if (provider() === 'local') {
    await writeLocal(`session:${tokenHash}`, session)
    return
  }
  if (provider() === 'mysql') {
    await mysqlPool().execute<ResultSetHeader>(
      `INSERT INTO yijian_sessions (token_hash,user_id,expires_at) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), expires_at = VALUES(expires_at)`,
      [tokenHash, session.userId, new Date(session.expiresAt)],
    )
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
  if (provider() === 'mysql') {
    await mysqlPool().execute<ResultSetHeader>('DELETE FROM yijian_sessions WHERE token_hash = ?', [tokenHash])
    return
  }
  const { error } = await supabase().from(SESSION_TABLE).delete().eq('token_hash', tokenHash)
  if (error) throw error
}

export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: string | number; errno?: number }
  return candidate.code === '23505' || candidate.code === 'ER_DUP_ENTRY' || candidate.errno === 1062
}
