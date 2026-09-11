import type { Config } from '@netlify/functions'
import { userFromRequest } from './_shared/auth.mts'
import { bodyOf, internalError, json, methodNotAllowed } from './_shared/http.mts'
import { confirmParcelPickup } from './_shared/parcels.mts'

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed()
  try {
    const user = await userFromRequest(request)
    if (!user) return json({ message: '请先登录后再确认取件', code: 'AUTH_REQUIRED' }, 401)
    const body = await bodyOf(request)
    const parcelId = typeof body.parcelId === 'string' ? body.parcelId.trim() : ''
    if (!parcelId) return json({ message: '缺少包裹信息，请刷新后重试', code: 'INVALID_PARCEL_ID' }, 400)
    const updated = await confirmParcelPickup(user.id, parcelId)
    if (!updated) return json({ message: '没有找到这个账号下的包裹', code: 'PARCEL_NOT_FOUND' }, 404)
    return json({ message: '已确认取件，取件码已删除' })
  } catch (error) {
    return internalError('parcel:confirm-pickup', error)
  }
}

export const config: Config = { path: '/api/parcels/confirm-pickup', method: 'POST' }
