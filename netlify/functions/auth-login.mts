import type { Config } from '@netlify/functions'
import { createSession, parseAuthBody, publicUser, readUserByEmail, verifyOtp, verifyPassword, authResponse } from './_shared/auth.mts'
import { internalError, json, methodNotAllowed } from './_shared/http.mts'
import { normalizeEmail, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './_shared/security.mts'

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed()

  try {
    const body = await parseAuthBody(request)
    const email = normalizeEmail(body.email)
    const modeValue = typeof body.mode === 'string' ? body.mode : ''
    const code = typeof body.code === 'string' ? body.code.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    if (!email) return json({ message: '请输入正确的邮箱地址', code: 'INVALID_EMAIL' }, 400)
    if (modeValue !== 'code' && modeValue !== 'password') return json({ message: '登录方式不正确，请刷新页面后重试', code: 'INVALID_MODE' }, 400)
    if (modeValue === 'code' && !/^\d{6}$/.test(code)) return json({ message: '请输入 6 位验证码', code: 'INVALID_OTP' }, 400)
    if (modeValue === 'password' && (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH)) {
      return json({ message: `密码长度需为 ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} 位`, code: 'INVALID_PASSWORD' }, 400)
    }

    const user = await readUserByEmail(email)
    if (!user) return json({ message: '该邮箱尚未注册，请先注册账号', code: 'EMAIL_NOT_REGISTERED' }, 404)

    const valid = modeValue === 'password' ? await verifyPassword(password, user.passwordHash) : await verifyOtp(email, 'login', code)
    if (!valid) return json({ message: modeValue === 'password' ? '邮箱或密码错误' : '验证码错误或已过期，请重新获取验证码', code: 'AUTH_FAILED' }, 401)

    const session = await createSession(user.id, request)
    return authResponse({ user: publicUser(user) }, session.cookie)
  } catch (error) {
    return internalError('auth:login', error)
  }
}

export const config: Config = { path: '/api/auth/login', method: 'POST' }