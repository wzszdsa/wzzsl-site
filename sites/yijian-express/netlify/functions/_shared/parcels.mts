import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from './config.mts'
import type { Kuaidi100Pickup, Kuaidi100TrackingCandidate, Kuaidi100TrackingDetail, Kuaidi100Trace } from './kuaidi100.mts'

export type StoredParcel = {
  id: string
  carrier: string
  short: string
  color: string
  pale: string
  tracking: string
  title: string
  route: string
  status: '待取件' | '运输中' | '已完成'
  eta: string
  updated: string
  location: string
  code?: string
  spot?: string
  events: Array<{ time: string; title: string; text: string; active?: boolean; location?: string; lat?: number; lng?: number }>
}

type ParcelRow = {
  id: string
  tracking_no: string
  carrier_code: string | null
  carrier_name: string | null
  status: StoredParcel['status']
  status_detail: string | null
  location: string | null
  pickup_code: string | null
  pickup_location: string | null
  eta: string | null
  last_synced_at: string
}

type EventRow = {
  parcel_id: string
  event_at: string | null
  title: string
  description: string
  location: string | null
  latitude: number | null
  longitude: number | null
}

const CARRIER_STYLE: Record<string, Pick<StoredParcel, 'carrier' | 'short' | 'color' | 'pale'>> = {
  shunfeng: { carrier: '顺丰速运', short: '顺丰', color: '#ed6b4d', pale: '#fff0ea' },
  jd: { carrier: '京东物流', short: '京东', color: '#4a6ff0', pale: '#edf2ff' },
  zto: { carrier: '中通快递', short: '中通', color: '#1d9f73', pale: '#e9faf3' },
  yto: { carrier: '圆通速递', short: '圆通', color: '#f0a334', pale: '#fff6e4' },
  yunda: { carrier: '韵达快递', short: '韵达', color: '#7659d6', pale: '#f1edff' },
  sto: { carrier: '申通快递', short: '申通', color: '#ef7c35', pale: '#fff0e7' },
  ems: { carrier: 'EMS', short: 'EMS', color: '#2b7bb9', pale: '#eaf5fd' },
  jtexpress: { carrier: '极兔速递', short: '极兔', color: '#e95c72', pale: '#fff0f3' },
  deppon: { carrier: '德邦快递', short: '德邦', color: '#3193bf', pale: '#eaf7fc' },
  best: { carrier: '百世快递', short: '百世', color: '#e5a52f', pale: '#fff8e5' },
  youshunda: { carrier: '优速快递', short: '优速', color: '#6b61ca', pale: '#f1efff' },
  anep: { carrier: '安能物流', short: '安能', color: '#e06e3a', pale: '#fff0e8' },
  china_post: { carrier: '中国邮政', short: '邮政', color: '#cf4e4e', pale: '#fff0f0' },
  zjs: { carrier: '宅急送', short: '宅急送', color: '#d96e3e', pale: '#fff1eb' },
}

function supabase(): SupabaseClient {
  const url = env('SUPABASE_URL')?.trim()
  const secret = (env('SUPABASE_SECRET') ?? env('SUPABASE_SECRET_KEY') ?? env('SUPABASE_SERVICE_ROLE_KEY'))?.trim()
  if (!url || !secret) throw new Error('Supabase 环境变量未配置完整')
  return createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } })
}

function displayTime(value?: string | null): string {
  if (!value) return '刚刚'
  const time = Date.parse(value)
  if (Number.isNaN(time)) return value
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60_000))
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} 小时前`
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(time))
}

function eventTime(value?: string | null): string {
  if (!value) return '刚刚'
  const time = Date.parse(value)
  if (Number.isNaN(time)) return value
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(time))
}

function styleFor(code: string | null, name: string | null): Pick<StoredParcel, 'carrier' | 'short' | 'color' | 'pale'> {
  const normalized = (code ?? '').toLowerCase()
  if (CARRIER_STYLE[normalized]) return CARRIER_STYLE[normalized]
  const carrier = name || code || '快递服务'
  return { carrier, short: carrier.slice(0, 2), color: '#667785', pale: '#eef2f4' }
}

function parcelFromRow(row: ParcelRow, events: EventRow[]): StoredParcel {
  const style = styleFor(row.carrier_code, row.carrier_name)
  const parcelEvents = events.map((event, index) => ({
    time: eventTime(event.event_at),
    title: event.title,
    text: event.location ? `${event.description} · ${event.location}` : event.description,
    active: index === 0,
    ...(event.location ? { location: event.location } : {}),
    ...(event.latitude !== null ? { lat: event.latitude } : {}),
    ...(event.longitude !== null ? { lng: event.longitude } : {}),
  }))
  return {
    id: row.id,
    ...style,
    tracking: row.tracking_no,
    title: row.carrier_name ? `${row.carrier_name}包裹` : '快递包裹',
    route: row.status_detail || '物流信息已同步',
    status: row.status,
    eta: row.eta || (row.status === '已完成' ? '已签收' : row.status === '待取件' ? '等待取件' : '运输中'),
    updated: displayTime(row.last_synced_at),
    location: row.location || '暂未返回当前位置',
    ...(row.pickup_code ? { code: row.pickup_code } : {}),
    ...(row.pickup_location ? { spot: row.pickup_location } : {}),
    events: parcelEvents.length ? parcelEvents : [{ time: displayTime(row.last_synced_at), title: '物流信息已同步', text: row.status_detail || '等待快递公司返回最新轨迹。', active: true }],
  }
}

export async function listParcels(userId: string): Promise<StoredParcel[]> {
  const client = supabase()
  const { data: rows, error } = await client.from('yijian_parcels').select('id,tracking_no,carrier_code,carrier_name,status,status_detail,location,pickup_code,pickup_location,eta,last_synced_at').eq('user_id', userId).order('last_synced_at', { ascending: false })
  if (error) throw error
  if (!rows?.length) return []
  const parcelIds = rows.map((row) => row.id as string)
  const { data: events, error: eventError } = await client.from('yijian_parcel_events').select('parcel_id,event_at,title,description,location,latitude,longitude').in('parcel_id', parcelIds).order('event_at', { ascending: false })
  if (eventError) throw eventError
  const byParcel = new Map<string, EventRow[]>()
  for (const event of (events ?? []) as EventRow[]) {
    const current = byParcel.get(event.parcel_id) ?? []
    current.push(event)
    byParcel.set(event.parcel_id, current)
  }
  return (rows as ParcelRow[]).map((row) => parcelFromRow(row, byParcel.get(row.id) ?? []))
}

export async function confirmParcelPickup(userId: string, parcelId: string): Promise<boolean> {
  const client = supabase()
  const now = new Date().toISOString()
  const { data: parcel, error } = await client.from('yijian_parcels').update({
    status: '已完成',
    status_detail: '用户已确认取件',
    location: '已从驿站取出',
    pickup_code: null,
    pickup_location: null,
    eta: '已取件',
    updated_at: now,
  }).eq('id', parcelId).eq('user_id', userId).select('id').maybeSingle()
  if (error) throw error
  if (!parcel) return false
  const { error: eventError } = await client.from('yijian_parcel_events').insert({
    parcel_id: parcel.id,
    event_at: now,
    title: '用户已确认取件',
    description: '取件码已按隐私策略删除。',
    location: '已从驿站取出',
  })
  if (eventError) throw eventError
  return true
}

export async function saveParcel(userId: string, candidate: Kuaidi100TrackingCandidate, detail: Kuaidi100TrackingDetail, pickup: Kuaidi100Pickup = {}): Promise<void> {
  const client = supabase()
  const now = new Date().toISOString()
  const record = {
    user_id: userId,
    tracking_no: candidate.trackingNo,
    carrier_code: detail.carrierCode ?? candidate.carrierCode ?? null,
    carrier_name: detail.carrierName ?? candidate.carrierName ?? null,
    status: detail.status,
    status_detail: detail.statusDetail ?? null,
    location: detail.location ?? null,
    pickup_code: pickup.code ?? null,
    pickup_location: pickup.location ?? null,
    eta: detail.eta ?? null,
    last_synced_at: now,
    updated_at: now,
  }
  const { data: parcel, error } = await client.from('yijian_parcels').upsert(record, { onConflict: 'user_id,tracking_no,carrier_code' }).select('id').single()
  if (error) throw error
  const eventRows = detail.traces.map((trace: Kuaidi100Trace) => ({
    parcel_id: parcel.id,
    event_at: trace.occurredAt ? new Date(trace.occurredAt).toISOString() : null,
    title: trace.title,
    description: trace.description,
    location: trace.location ?? null,
    latitude: trace.latitude ?? null,
    longitude: trace.longitude ?? null,
  }))
  if (eventRows.length) {
    const { error: eventError } = await client.from('yijian_parcel_events').upsert(eventRows, { onConflict: 'parcel_id,event_at,title,description' })
    if (eventError) throw eventError
  }
}
