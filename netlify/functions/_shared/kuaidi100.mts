import { createHash } from 'node:crypto'
import { env } from './config.mts'

export type Kuaidi100TrackingCandidate = {
  trackingNo: string
  carrierCode?: string
  carrierName?: string
  initialTraces?: Kuaidi100Trace[]
}

export type Kuaidi100Trace = {
  occurredAt?: string
  title: string
  description: string
  location?: string
}

export type Kuaidi100TrackingDetail = {
  carrierCode?: string
  carrierName?: string
  status: string
  statusDetail?: string
  location?: string
  eta?: string
  traces: Kuaidi100Trace[]
}

export type Kuaidi100Pickup = {
  code?: string
  location?: string
}

function required(name: string): string {
  const value = env(name)?.trim()
  if (!value) throw new Error(`${name} 未配置`)
  return value
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function firstText(record: Record<string, unknown>, names: string[]): string | undefined {
  for (const name of names) {
    const value = optionalText(record[name])
    if (value) return value
  }
  return undefined
}

function messageFrom(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const record = payload as Record<string, unknown>
  return firstText(record, ['message', 'msg', 'reason', 'errorMessage'])
}

function ensureSuccess(payload: unknown): void {
  if (!payload || typeof payload !== 'object') throw new Error('快递100返回了无效数据')
  const record = payload as Record<string, unknown>
  const status = record.status ?? record.success ?? record.result
  if (status === false || status === '0' || status === 0) throw new Error(messageFrom(payload) ?? '快递100查询失败')
}

function sign(param: string, key: string, customer: string): string {
  return createHash('md5').update(`${param}${key}${customer}`, 'utf8').digest('hex').toUpperCase()
}

async function request(urlName: string, payload: Record<string, unknown>): Promise<unknown> {
  const url = required(urlName)
  const key = required('KUAIDI100_KEY')
  const customer = required('KUAIDI100_CUSTOMER')
  const param = JSON.stringify(payload)
  const body = new URLSearchParams({
    param,
    key,
    customer,
    sign: sign(param, key, customer),
  })
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=utf-8', accept: 'application/json' },
    body,
    signal: AbortSignal.timeout(15_000),
  })
  const text = await response.text()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`快递100响应格式错误（HTTP ${response.status}）`)
  }
  if (!response.ok) throw new Error(messageFrom(data) ?? `快递100请求失败（HTTP ${response.status}）`)
  ensureSuccess(data)
  return data
}

function normalizedStatus(value: unknown): string {
  const state = String(value ?? '').trim()
  if (['3', '5', '301', '302', '303'].includes(state) || /签收|已取件|妥投/.test(state)) return '已完成'
  if (['202', '204', '205', '208', '209', '304'].includes(state) || /驿站|快递柜|待取件|代收/.test(state)) return '待取件'
  return '运输中'
}

function tracesFrom(payload: Record<string, unknown>): Kuaidi100Trace[] {
  const raw = payload.data ?? payload.traces ?? payload.route
  if (!Array.isArray(raw)) return []
  return raw.map((item) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    const description = firstText(record, ['context', 'desc', 'description', 'status', 'remark']) ?? '物流状态已更新'
    return {
      occurredAt: firstText(record, ['ftime', 'time', 'acceptTime', 'datetime']),
      title: firstText(record, ['status', 'statusName', 'remark']) ?? description,
      description,
      location: firstText(record, ['location', 'areaName', 'city']),
    }
  }).filter((item) => item.description)
}

export async function recognizeTrackingNo(trackingNo: string): Promise<Kuaidi100TrackingCandidate[]> {
  const url = `${env('KUAIDI100_RECOGNIZE_URL')?.trim() || 'https://www.kuaidi100.com/autonumber/autoComNum'}?text=${encodeURIComponent(trackingNo)}`
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error(`快递公司识别失败（HTTP ${response.status}）`)
  const payload = await response.json() as { auto?: Array<{ comCode?: unknown; name?: unknown }> }
  const candidates = (payload.auto ?? []).flatMap((item) => {
    const carrierCode = optionalText(item.comCode)
    return carrierCode ? [{ trackingNo, carrierCode, carrierName: optionalText(item.name) }] : []
  })
  if (candidates.length) return candidates

  // 快递100的自动识别接口偶尔不会返回 JT/极兔，但查询接口支持其固定编码。
  if (/^JT/i.test(trackingNo)) {
    return [{ trackingNo, carrierCode: 'jtexpress', carrierName: '极兔速递' }]
  }

  throw new Error('未能识别快递公司，请确认运单号是否正确')
}

export async function queryTracking(candidate: Kuaidi100TrackingCandidate): Promise<Kuaidi100TrackingDetail> {
  const payload = await request('KUAIDI100_TRACK_QUERY_URL', { com: candidate.carrierCode ?? '', num: candidate.trackingNo })
  const record = payload as Record<string, unknown>
  const traces = tracesFrom(record)
  const latest = traces[0]
  return {
    carrierCode: firstText(record, ['com', 'companyCode']) ?? candidate.carrierCode,
    carrierName: firstText(record, ['company', 'companyName', 'comName']) ?? candidate.carrierName,
    status: normalizedStatus(record.state ?? record.stateEx ?? latest?.title),
    statusDetail: firstText(record, ['state', 'stateEx', 'status', 'message']),
    location: firstText(record, ['location', 'currentLocation']) ?? latest?.location,
    eta: firstText(record, ['estimatedTime', 'estimateTime', 'eta']),
    traces,
  }
}

