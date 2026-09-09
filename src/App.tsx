import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import { ArrowUpRight, Bell, Check, ChevronRight, CircleAlert, CircleCheck, Clipboard, Clock3, Copy, Eye, EyeOff, House, KeyRound, Layers3, Link2, LockKeyhole, LogIn, LogOut, MapPin, Menu, Package, PackageCheck, RefreshCw, Search, Settings2, ShieldCheck, Smartphone, Sparkles, Truck, UserRound, X, Zap } from 'lucide-react'
import { apiRequest } from './api'
import './App.css'

type Status = '待取件' | '运输中' | '已完成'
type Filter = '全部' | Status
type View = 'packages' | 'sources' | 'settings'
type AuthMode = 'code' | 'password'
type AuthView = 'login' | 'register'
type AuthStatus = 'checking' | 'authenticated' | 'anonymous' | 'unavailable'
type AuthUser = { id: string; email: string; createdAt: string }
type AuthResponse = { user?: AuthUser | null; message?: string; code?: string; retryAfter?: number; demoCode?: string }
type SendCodeResult = { ok: boolean; status: number; retryAfter?: number; message?: string }

type Event = { time: string; title: string; text: string; active?: boolean }
type Parcel = { id: string; carrier: string; short: string; color: string; pale: string; tracking: string; title: string; route: string; status: Status; eta: string; updated: string; location: string; code?: string; spot?: string; events: Event[] }
type Provider = { name: string; short: string; color: string; pale: string; connected: boolean; synced?: string; description: string }

const initialParcels: Parcel[] = [
  { id: 'sf-1428309204', carrier: '顺丰速运', short: '顺丰', color: '#ed6b4d', pale: '#fff0ea', tracking: 'SF142 830 920 4', title: '日用收纳用品', route: '深圳 → 杭州', status: '待取件', eta: '今天 18:30 前', updated: '12 分钟前', location: '星河湾 2 号驿站', code: 'A6-219', spot: '星河湾 2 号驿站 · 取件柜 06', events: [{ time: '14:18', title: '包裹已到站', text: '包裹已放入星河湾 2 号驿站，请及时取件。', active: true }, { time: '11:42', title: '快递员派送中', text: '杭州滨江区江虹路营业点正在派送。' }, { time: '昨天 20:06', title: '到达杭州', text: '快件到达杭州转运中心。' }, { time: '9 月 6 日', title: '已从深圳发出', text: '快件离开深圳宝安中转场。' }] },
  { id: 'jd-3881024501', carrier: '京东物流', short: '京东', color: '#4a6ff0', pale: '#edf2ff', tracking: 'JD388 102 450 1', title: '桌面显示器支架', route: '北京 → 杭州', status: '运输中', eta: '预计明天送达', updated: '28 分钟前', location: '运输中 · 杭州方向', events: [{ time: '13:56', title: '运输中', text: '包裹正在前往杭州配送站。', active: true }, { time: '10:28', title: '到达北京转运中心', text: '快件已完成分拣，准备发往杭州。' }, { time: '9 月 7 日', title: '已揽收', text: '京东快递员已完成揽收。' }] },
  { id: 'yto-7719032608', carrier: '圆通速递', short: '圆通', color: '#f0a334', pale: '#fff6e4', tracking: 'YT771 903 260 8', title: '书籍 · 2 件', route: '武汉 → 杭州', status: '待取件', eta: '今天 20:00 前', updated: '1 小时前', location: '滨盛小区 1 号驿站', code: 'B2-074', spot: '滨盛小区 1 号驿站 · 前台', events: [{ time: '13:06', title: '包裹已到站', text: '已由驿站代收，请凭取件码领取。', active: true }, { time: '10:30', title: '派送中', text: '快递员正在派送，预计今天送达。' }, { time: '9 月 7 日', title: '已揽收', text: '圆通武汉光谷网点已揽收。' }] },
  { id: 'yd-6201158803', carrier: '韵达快递', short: '韵达', color: '#7659d6', pale: '#f1edff', tracking: 'YD620 115 880 3', title: '咖啡豆', route: '昆明 → 杭州', status: '已完成', eta: '已取件', updated: '昨天 19:23', location: '已从滨盛小区驿站取出', events: [{ time: '昨天 19:23', title: '用户已确认取件', text: '取件码已按隐私策略删除。', active: true }, { time: '昨天 17:48', title: '包裹已到站', text: '包裹已放入滨盛小区驿站。' }, { time: '9 月 6 日', title: '运输中', text: '快件正在前往杭州。' }] },
]

const providerList: Provider[] = [
  { name: '顺丰速运', short: '顺丰', color: '#ed6b4d', pale: '#fff0ea', connected: true, synced: '2 分钟前', description: '物流轨迹 · 到站提醒 · 取件码' },
  { name: '京东物流', short: '京东', color: '#4a6ff0', pale: '#edf2ff', connected: true, synced: '5 分钟前', description: '物流轨迹 · 配送状态' },
  { name: '中通快递', short: '中通', color: '#1d9f73', pale: '#e9faf3', connected: false, description: '等待用户授权' },
  { name: '圆通速递', short: '圆通', color: '#f0a334', pale: '#fff6e4', connected: true, synced: '12 分钟前', description: '物流轨迹 · 到站提醒 · 取件码' },
  { name: '韵达快递', short: '韵达', color: '#7659d6', pale: '#f1edff', connected: true, synced: '18 分钟前', description: '物流轨迹 · 到站提醒' },
]

const nav: Array<{ key: View; label: string; icon: ReactNode }> = [
  { key: 'packages', label: '我的包裹', icon: <House size={18} /> },
  { key: 'sources', label: '数据来源', icon: <Layers3 size={18} /> },
  { key: 'settings', label: '账号设置', icon: <Settings2 size={18} /> },
]

const maskEmail = (email: string) => { const [local, domain] = email.split('@'); if (!domain) return email; return `${local.slice(0, 2)}***@${domain}` }
const avatarText = (email: string) => email.trim().charAt(0).toUpperCase() || '驿'
const cssVars = (color: string, pale: string) => ({ '--carrier': color, '--carrier-pale': pale } as CSSProperties)

export default function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('checking')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [view, setView] = useState<View>('packages')
  const [filter, setFilter] = useState<Filter>('全部')
  const [query, setQuery] = useState('')
  const [parcels, setParcels] = useState(initialParcels)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [visible, setVisible] = useState<Record<string, boolean>>({})
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState('刚刚')
  const [notice, setNotice] = useState('')
  const [mobileNav, setMobileNav] = useState(false)
  const [modal, setModal] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('code')
  const [authView, setAuthView] = useState<AuthView>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [verificationTarget, setVerificationTarget] = useState('')
  const [autoSync, setAutoSync] = useState(true)
  const [push, setPush] = useState(true)
  const demoAuthEnabled = import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEMO_AUTH !== 'false'

  useEffect(() => {
    let active = true
    void apiRequest<AuthResponse>('/api/auth/me').then(({ response, data }) => {
      if (!active) return
      if (response.ok && data?.user) {
        setUser(data.user)
        setEmail(data.user.email)
        setAuthStatus('authenticated')
      } else if (response.status === 401) {
        setAuthStatus('anonymous')
      } else {
        setAuthStatus('unavailable')
      }
    }).catch(() => {
      if (active) setAuthStatus('unavailable')
    })
    return () => { active = false }
  }, [])

  const selected = useMemo(() => parcels.find((item) => item.id === selectedId) ?? null, [parcels, selectedId])
  const connected = providerList.filter((item) => item.connected).length
  const waiting = parcels.filter((item) => item.status === '待取件').length
  const transit = parcels.filter((item) => item.status === '运输中').length
  const filtered = useMemo(() => parcels.filter((item) => (filter === '全部' || item.status === filter) && (!query.trim() || [item.carrier, item.title, item.tracking, item.location].some((field) => field.toLowerCase().includes(query.trim().toLowerCase())))), [filter, parcels, query])

  const toast = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(''), 2600) }
  const sync = () => { if (syncing) return; setSyncing(true); window.setTimeout(() => { setSyncing(false); setLastSync('刚刚'); toast('已完成同步，4 个平台返回了最新状态') }, 850) }
  const copy = (code: string) => { navigator.clipboard?.writeText(code).then(() => toast(`取件码 ${code} 已复制`)).catch(() => toast('复制失败，请手动记录')) }
  const confirm = (parcel: Parcel) => { setParcels((items) => items.map((item) => item.id === parcel.id ? { ...item, status: '已完成', eta: '已取件', code: undefined, updated: '刚刚', location: '已从驿站取出', events: [{ time: '刚刚', title: '用户已确认取件', text: '取件码已按隐私策略删除。', active: true }, ...item.events] } : item)); setSelectedId(null); setVisible((items) => ({ ...items, [parcel.id]: false })); toast('已确认取件，取件码已删除') }

  const changeAuthView = (value: AuthView) => {
    setAuthView(value)
    setAuthMode('code')
    setPassword('')
    setVerificationTarget('')
  }

  const changeAuthMode = (value: AuthMode) => {
    setAuthMode(value)
    setPassword('')
    setVerificationTarget('')
  }

  const sendCode = async (targetEmail: string, purpose: AuthView): Promise<SendCodeResult> => {
    const normalizedEmail = targetEmail.trim().toLowerCase()
    try {
      const { response, data } = await apiRequest<AuthResponse>('/api/auth/send-code', { method: 'POST', body: JSON.stringify({ email: normalizedEmail, purpose }) })
      if (!data) {
        if (demoAuthEnabled) {
          setVerificationTarget(normalizedEmail)
          toast('当前为本地演示模式，验证码为 123456')
          return { ok: true, status: response.status, retryAfter: 60, message: '演示验证码已准备好' }
        }
        toast('服务响应异常，请稍后重试')
        return { ok: false, status: response.status }
      }
      if (!response.ok) {
        if (response.status === 409 && purpose === 'register') {
          changeAuthView('login')
          toast(data.message ?? '该邮箱已注册，已切换到登录')
        } else {
          toast(data.message ?? '验证码发送失败')
        }
        return { ok: false, status: response.status, retryAfter: data.retryAfter, message: data.message }
      }
      setVerificationTarget(normalizedEmail)
      toast(data.demoCode ? `验证码已发送，演示码：${data.demoCode}` : data.message ?? '验证码已发送，请查收邮件')
      return { ok: true, status: response.status, retryAfter: data.retryAfter ?? 60, message: data.message }
    } catch {
      if (demoAuthEnabled) {
        setVerificationTarget(normalizedEmail)
        toast('当前为本地演示模式，验证码为 123456')
        return { ok: true, status: 0, retryAfter: 60, message: '演示验证码已准备好' }
      }
      toast('暂时无法连接服务，请检查网络后重试')
      return { ok: false, status: 0 }
    }
  }

  const finishAuth = (authUser: AuthUser, message: string) => {
    setUser(authUser)
    setEmail(authUser.email)
    setAuthStatus('authenticated')
    setAuthBusy(false)
    setModal(false)
    setPassword('')
    setVerificationTarget('')
    toast(message)
  }

  const submitAuth = async (code?: string) => {
    if (authBusy) return
    const normalizedEmail = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return toast('请输入正确的邮箱地址')
    if ((authMode === 'code' || authView === 'register') && (!code || !/^\d{6}$/.test(code))) return toast('请输入 6 位验证码')
    if (code && verificationTarget && verificationTarget !== normalizedEmail) return toast(`验证码已发送到 ${maskEmail(verificationTarget)}，请使用该邮箱完成验证`)
    if (authMode === 'password' && (password.length < 6 || password.length > 128)) return toast('密码长度需为 6-128 位')

    setAuthBusy(true)
    const demoUser = { id: 'demo-user', email: normalizedEmail, createdAt: new Date().toISOString() }
    try {
      const endpoint = authView === 'register' ? '/api/auth/register' : '/api/auth/login'
      const payload = authView === 'register'
        ? { email: normalizedEmail, code, password: authMode === 'password' ? password : undefined }
        : { email: normalizedEmail, mode: authMode, code: authMode === 'code' ? code : undefined, password: authMode === 'password' ? password : undefined }
      const { response, data } = await apiRequest<AuthResponse>(endpoint, { method: 'POST', body: JSON.stringify(payload) })
      if (!data) {
        if (demoAuthEnabled && authMode === 'code' && code === '123456') {
          finishAuth(demoUser, authView === 'register' ? '演示注册成功，已自动登录' : '演示登录成功，已进入你的包裹空间')
        } else {
          setAuthBusy(false)
          toast(demoAuthEnabled ? '本地演示验证码为 123456' : '服务响应异常，请稍后重试')
        }
        return
      }
      if (!response.ok) {
        setAuthBusy(false)
        if (response.status === 409 && authView === 'register') changeAuthView('login')
        toast(data.message ?? (authView === 'register' ? '注册失败' : '登录失败'))
        return
      }
      if (!data.user) {
        setAuthBusy(false)
        toast('登录状态响应异常，请稍后重试')
        return
      }
      finishAuth(data.user, authView === 'register' ? '注册成功，已自动登录' : '登录成功，已进入你的包裹空间')
    } catch {
      if (demoAuthEnabled && authMode === 'code' && code === '123456') {
        finishAuth(demoUser, authView === 'register' ? '演示注册成功，已自动登录' : '演示登录成功，已进入你的包裹空间')
      } else {
        setAuthBusy(false)
        toast('网络异常，请稍后重试')
      }
    }
  }

  const logout = async () => {
    try {
      const { response } = await apiRequest<AuthResponse>('/api/auth/logout', { method: 'POST' })
      if (!response.ok) toast('本地已退出，但服务器会话清理未完成，请稍后重新打开页面')
    } catch {
      toast('本地已退出；网络恢复后请重新打开页面确认会话')
    } finally {
      setUser(null)
      setAuthStatus('anonymous')
      setModal(false)
      changeAuthView('login')
    }
  }

  if (authStatus === 'checking') return <AuthLoading />

  if (authStatus !== 'authenticated' || !user) return <LoginPage view={authView} setView={changeAuthView} mode={authMode} setMode={changeAuthMode} email={email} setEmail={setEmail} password={password} setPassword={setPassword} onSubmit={submitAuth} onNotice={toast} onSendCode={sendCode} busy={authBusy} demoMode={demoAuthEnabled} backendUnavailable={authStatus === 'unavailable'} />

  return (    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
        <div className="brand"><div className="brand-mark"><PackageCheck size={20} /></div><div><strong>驿见</strong><span>你的快递都在这里</span></div></div>
        <div className="side-label">工作台</div>
        <nav>{nav.map((item) => <button key={item.key} className={`nav-item ${view === item.key ? 'active' : ''}`} onClick={() => { setView(item.key); setMobileNav(false) }}>{item.icon}<span>{item.label}</span>{item.key === 'packages' && waiting > 0 && <em>{waiting}</em>}</button>)}</nav>
        <div className="side-spacer" />
        <div className="privacy-tip"><ShieldCheck size={17} /><div><strong>隐私优先</strong><span>取件码只在你的设备内展示</span></div></div>
        <button className="side-account" onClick={() => { setAuthView('login'); setModal(true) }}><span className="avatar">{avatarText(user.email)}</span><span><strong>我的账号</strong><small>{maskEmail(user.email)}</small></span><ChevronRight size={16} /></button>
      </aside>
      <main className="main">
        <header className="topbar"><button className="mobile-menu" onClick={() => setMobileNav(!mobileNav)}><Menu size={21} /></button><div className="crumb"><span>驿站工作台</span><ChevronRight size={14} /><b>{view === 'packages' ? '我的包裹' : view === 'sources' ? '数据来源' : '账号设置'}</b></div><div className="top-actions"><button className="icon-btn dot" onClick={() => toast('暂无新的未读提醒')}><Bell size={18} /></button><button className="account-chip" onClick={() => { setAuthView('login'); setModal(true) }}><span className="avatar small">{avatarText(user.email)}</span><span>{maskEmail(user.email)}</span><ChevronRight size={14} /></button></div></header>
        <div className="content">
          {view === 'packages' && <Packages parcels={parcels} filtered={filtered} filter={filter} setFilter={setFilter} query={query} setQuery={setQuery} waiting={waiting} transit={transit} connected={connected} syncing={syncing} lastSync={lastSync} onSync={sync} visible={visible} setVisible={setVisible} onOpen={setSelectedId} onCopy={copy} onConfirm={confirm} />}
          {view === 'sources' && <Sources connected={connected} onConnect={(provider) => toast(`${provider.name} 的授权流程将在接入真实 API 后启用`)} />}
          {view === 'settings' && <Settings email={user.email} autoSync={autoSync} push={push} setAutoSync={setAutoSync} setPush={setPush} onLogout={logout} />}
        </div>
      </main>
      {selected && <Drawer parcel={selected} shown={Boolean(visible[selected.id])} toggle={() => setVisible((items) => ({ ...items, [selected.id]: !items[selected.id] }))} onCopy={copy} onClose={() => setSelectedId(null)} onConfirm={confirm} />}
      {modal && <LoginModal view={authView} setView={changeAuthView} mode={authMode} setMode={changeAuthMode} email={email} setEmail={setEmail} password={password} setPassword={setPassword} onSubmit={submitAuth} onNotice={toast} onSendCode={sendCode} busy={authBusy} demoMode={demoAuthEnabled} backendUnavailable={false} onClose={() => setModal(false)} onLogout={logout} />}
      {notice && <div className="toast" role="status" aria-live="polite"><CircleCheck size={17} />{notice}</div>}
    </div>
  )
}

function AuthLoading() {
  return <div className="auth-loading" role="status" aria-live="polite"><span className="brand-mark"><PackageCheck size={20} /></span><strong>正在恢复登录状态…</strong><small>正在安全检查你的会话</small></div>
}

function Header({ kicker, title, text, action }: { kicker: ReactNode; title: ReactNode; text: string; action?: ReactNode }) {
  return <section className="heading"><div><div className="eyebrow">{kicker}</div><h1>{title}</h1><p>{text}</p></div>{action}</section>
}

function Packages({ parcels, filtered, filter, setFilter, query, setQuery, waiting, transit, connected, syncing, lastSync, onSync, visible, setVisible, onOpen, onCopy, onConfirm }: { parcels: Parcel[]; filtered: Parcel[]; filter: Filter; setFilter: (value: Filter) => void; query: string; setQuery: (value: string) => void; waiting: number; transit: number; connected: number; syncing: boolean; lastSync: string; onSync: () => void; visible: Record<string, boolean>; setVisible: React.Dispatch<React.SetStateAction<Record<string, boolean>>>; onOpen: (id: string) => void; onCopy: (code: string) => void; onConfirm: (parcel: Parcel) => void }) {
  return <>
    <Header kicker={<><Sparkles size={14} /> 周二 · 9 月 8 日</>} title={<>今天的包裹，<span>一眼就够了。</span></>} text={`已为你同步 ${parcels.length} 个包裹，最后更新于 ${lastSync}。`} action={<button className={`sync-btn ${syncing ? 'syncing' : ''}`} onClick={onSync}><RefreshCw size={17} />{syncing ? '同步中…' : '立即同步'}</button>} />
    <section className="summary"><div className="hero"><div className="orb one" /><div className="orb two" /><div className="hero-copy"><div className="hero-kicker"><i /> 快递状态已自动更新</div><h2>{waiting ? `有 ${waiting} 个包裹，正在等你取件` : '今天没有待取件包裹'}</h2><p>{waiting ? '取件码只会在你的账号内展示，确认取件后会自动删除。' : '所有包裹都已处理完毕，继续保持轻松。'}</p><div className="stats"><div><b>{waiting}</b><span>待取件</span></div><div><b>{transit}</b><span>运输中</span></div><div><b>{connected}</b><span>已连接平台</span></div></div></div><div className="hero-art"><div><Package size={29} /><small>包裹状态</small><b>实时同步</b></div><span><Check size={14} /></span></div></div><div className="trust"><div className="trust-title"><span><ShieldCheck size={19} /></span>安心提示</div><h3>你的数据，只为你服务</h3><p>邮箱地址经过验证后，我们只同步你授权的平台。取件码不会出现在推送通知里。</p><footer><span><LockKeyhole size={14} /> 加密存储</span><span><Zap size={14} /> 自动清理</span></footer></div></section>
    <div className="section-head"><div><h2>包裹列表</h2><span>{filtered.length} 个结果</span></div><div className="section-tools"><label className="search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索平台、包裹或单号" /></label><button className="sync-label"><Zap size={15} /> 自动同步中</button></div></div>
    <div className="tabs">{(['全部', '待取件', '运输中', '已完成'] as Filter[]).map((item) => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}{item !== '全部' && <em>{parcels.filter((parcel) => parcel.status === item).length}</em>}</button>)}</div>
    {filtered.length ? <div className="parcel-grid">{filtered.map((parcel) => <Card key={parcel.id} parcel={parcel} shown={Boolean(visible[parcel.id])} toggle={() => setVisible((items) => ({ ...items, [parcel.id]: !items[parcel.id] }))} onOpen={() => onOpen(parcel.id)} onCopy={onCopy} onConfirm={onConfirm} />)}</div> : <div className="empty"><Search size={24} /><strong>没有找到匹配的包裹</strong><span>试试搜索其他平台或运单号。</span></div>}
    <div className="integration"><div className="integration-icon"><CircleAlert size={18} /></div><div><strong>数据接入说明</strong><p>当前为交互演示数据。上线前将通过官方或授权的聚合 API 接入真实物流状态；无法返回取件码的平台不会被强行展示。</p></div><button onClick={() => window.alert('请在“数据来源”中查看授权状态。')}>查看授权 <ArrowUpRight size={15} /></button></div>
  </>
}

function Card({ parcel, shown, toggle, onOpen, onCopy, onConfirm }: { parcel: Parcel; shown: boolean; toggle: () => void; onOpen: () => void; onCopy: (code: string) => void; onConfirm: (parcel: Parcel) => void }) {
  const waiting = parcel.status === '待取件'
  return <article className={`parcel ${waiting ? 'waiting' : ''}`} style={cssVars(parcel.color, parcel.pale)}><div className="parcel-head"><div className="carrier"><Truck size={19} /></div><div className="carrier-copy"><b>{parcel.carrier}</b><span>{parcel.tracking}</span></div><Pill status={parcel.status} /></div><button className="parcel-main" onClick={onOpen}><div><h3>{parcel.title}</h3><p>{parcel.route}</p></div><ChevronRight size={18} /></button><div className="meta"><span><MapPin size={14} />{parcel.location}</span><span><Clock3 size={14} />{parcel.updated}</span></div>{waiting && parcel.code ? <div className="code-panel"><div className="code-top"><span><PackageCheck size={15} /> 取件码</span><small><ShieldCheck size={13} /> 仅本人可见</small></div><div className="code-row"><b>{shown ? parcel.code : '•••-•••'}</b><button onClick={toggle}><Eye size={16} /></button>{shown && <button onClick={() => onCopy(parcel.code ?? '')}><Copy size={16} /></button>}</div><small className="spot">{parcel.spot}</small></div> : <div className="card-foot"><span><i className={parcel.status === '已完成' ? 'done' : ''} />{parcel.eta}</span><button onClick={onOpen}>查看轨迹 <ChevronRight size={14} /></button></div>}{waiting && <div className="card-actions"><button onClick={onOpen}>查看完整轨迹 <ChevronRight size={14} /></button><button onClick={() => onConfirm(parcel)}><Check size={15} /> 我已取件</button></div>}</article>
}

function Pill({ status }: { status: Status }) { return <span className={`pill ${status === '待取件' ? 'wait' : status === '运输中' ? 'transit' : 'done'}`}>{status === '待取件' ? <PackageCheck size={13} /> : status === '运输中' ? <Truck size={13} /> : <Check size={13} />}{status}</span> }
function Sources({ connected, onConnect }: { connected: number; onConnect: (provider: Provider) => void }) {
  return <><Header kicker={<><Link2 size={14} /> 授权管理</>} title={<>数据来源，<span>由你决定。</span></>} text={`已连接 ${connected} 个平台，只有经过验证的来源才会同步到你的包裹列表。`} action={<button className="outline-btn"><Clipboard size={16} /> 授权说明</button>} /><section className="source-banner"><div className="source-icon"><ShieldCheck size={24} /></div><div><strong>我们不会通过邮箱地址猜测包裹</strong><p>每个来源都需要通过官方或授权的接口完成验证，取件码只会在授权有效时展示。</p></div><span className="secure"><i /> 连接安全</span></section><div className="section-head"><div><h2>支持的平台</h2><span>首发支持 5 个平台</span></div><div className="source-count"><b>{connected}</b><span>/ 5 已连接</span></div></div><div className="provider-grid">{providerList.map((provider) => <article className="provider" key={provider.name} style={cssVars(provider.color, provider.pale)}><div className="provider-top"><span>{provider.short.slice(0, 1)}</span>{provider.connected ? <b><CircleCheck size={14} /> 已连接</b> : <small>未连接</small>}</div><h3>{provider.name}</h3><p>{provider.description}</p>{provider.connected ? <footer><span><RefreshCw size={13} /> {provider.synced}同步</span><button onClick={() => onConnect(provider)}>管理 <ChevronRight size={14} /></button></footer> : <button className="connect" onClick={() => onConnect(provider)}><Link2 size={15} /> 连接平台</button>}</article>)}</div><section className="how"><div className="section-head"><div><h2>授权流程</h2><span>三步完成安全接入</span></div></div><div className="steps"><Step no="01" icon={<Smartphone size={18} />} title="验证邮箱地址" text="确认这是你本人正在使用的邮箱地址。" /><Step no="02" icon={<Link2 size={18} />} title="授权数据来源" text="只选择你愿意同步的快递平台。" /><Step no="03" icon={<PackageCheck size={18} />} title="开始自动同步" text="到站后提醒，取件后自动清理取件码。" /></div></section></>
}
function Step({ no, icon, title, text }: { no: string; icon: ReactNode; title: string; text: string }) { return <div className="step"><small>{no}</small><div>{icon}</div><strong>{title}</strong><p>{text}</p></div> }

function Settings({ email, autoSync, push, setAutoSync, setPush, onLogout }: { email: string; autoSync: boolean; push: boolean; setAutoSync: (value: boolean) => void; setPush: (value: boolean) => void; onLogout: () => void }) {
  return <><Header kicker={<><Settings2 size={14} /> 账号与偏好</>} title={<>把体验调成，<span>你喜欢的样子。</span></>} text="账号安全、同步频率和隐私策略，都可以在这里管理。" /><div className="settings-grid"><section className="settings"><div className="settings-title"><div><small>账号信息</small><h2>登录与安全</h2></div><span><LockKeyhole size={18} /></span></div><div className="profile"><span className="avatar large">{avatarText(email)}</span><div><b>已验证邮箱地址</b><small>{maskEmail(email)}</small></div><em><Check size={13} /> 已验证</em></div><div className="setting-row"><div><b>登录方式</b><small>邮箱验证码 · 密码登录均可用</small></div><button>管理 <ChevronRight size={15} /></button></div><div className="setting-row"><div><b>授权设备</b><small>当前设备 · 最后活跃刚刚</small></div><button>查看 <ChevronRight size={15} /></button></div><button className="logout" onClick={onLogout}><LogOut size={15} /> 退出当前账号</button></section><section className="settings"><div className="settings-title"><div><small>同步与提醒</small><h2>让更新自动发生</h2></div><span className="warm"><Zap size={18} /></span></div><Toggle icon={<RefreshCw size={17} />} title="后台自动同步" text="定期检查授权平台的最新状态" enabled={autoSync} onToggle={() => setAutoSync(!autoSync)} /><Toggle icon={<Bell size={17} />} title="到站提醒" text="推送提醒，但不展示完整取件码" enabled={push} onToggle={() => setPush(!push)} /><div className="rule"><ShieldCheck size={17} /><div><b>取件码删除规则</b><p>点击“我已取件”后立即删除；若一直未确认，最多保留 30 天。</p></div></div></section></div><div className="footnote"><CircleAlert size={17} /> 当前为交互演示环境，真实上线时会将授权凭证放在服务端加密存储，前端不会接触平台密钥。</div></>
}
function Toggle({ icon, title, text, enabled, onToggle }: { icon: ReactNode; title: string; text: string; enabled: boolean; onToggle: () => void }) { return <div className="toggle-row"><span>{icon}</span><div><b>{title}</b><small>{text}</small></div><button className={`toggle ${enabled ? 'on' : ''}`} onClick={onToggle}><i /></button></div> }

function Drawer({ parcel, shown, toggle, onCopy, onClose, onConfirm }: { parcel: Parcel; shown: boolean; toggle: () => void; onCopy: (code: string) => void; onClose: () => void; onConfirm: (parcel: Parcel) => void }) {
  return <div className="drawer-layer" onClick={onClose}><aside className="drawer" onClick={(event) => event.stopPropagation()}><div className="drawer-head"><div><small>包裹详情</small><h2>{parcel.title}</h2></div><button className="icon-btn" onClick={onClose}><X size={18} /></button></div><div className="drawer-carrier"><span className="carrier" style={cssVars(parcel.color, parcel.pale)}><Truck size={19} /></span><div><b>{parcel.carrier}</b><small>{parcel.tracking}</small></div><Pill status={parcel.status} /></div>{parcel.code ? <div className="drawer-code"><div><span>取件码</span><small>{parcel.spot}</small></div><strong>{shown ? parcel.code : '•••-•••'}</strong><button onClick={toggle}><Eye size={16} /></button>{shown && <button onClick={() => onCopy(parcel.code ?? '')}><Copy size={16} /></button>}</div> : <div className="drawer-status"><span><Truck size={18} /></span><div><b>{parcel.eta}</b><small>{parcel.location}</small></div></div>}<div className="timeline"><header><b>物流轨迹</b><small>{parcel.events.length} 条记录</small></header>{parcel.events.map((event, index) => <div className={`event ${event.active ? 'active' : ''}`} key={`${event.time}-${index}`}><i /><div><div><b>{event.title}</b><time>{event.time}</time></div><p>{event.text}</p></div></div>)}</div>{parcel.code && <button className="drawer-confirm" onClick={() => onConfirm(parcel)}><Check size={16} /> 我已取件，删除取件码</button>}<div className="drawer-note"><ShieldCheck size={15} />取件码只在你的账号内展示；确认取件后立即从系统删除。</div></aside></div>
}

type AuthFormProps = {
  view: AuthView
  setView: (value: AuthView) => void
  mode: AuthMode
  setMode: (value: AuthMode) => void
  email: string
  setEmail: (value: string) => void
  password: string
  setPassword: (value: string) => void
  onSubmit: (code?: string) => void | Promise<void>
  onNotice: (text: string) => void
  onSendCode: (email: string, purpose: AuthView) => Promise<SendCodeResult>
  busy: boolean
  demoMode: boolean
  backendUnavailable: boolean
}

function AuthForm({ view, setView, mode, setMode, email, setEmail, password, setPassword, onSubmit, onNotice, onSendCode, busy, demoMode, backendUnavailable }: AuthFormProps) {
  const isRegistering = view === 'register'
  const [verificationCode, setVerificationCode] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [sendingCode, setSendingCode] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [lastSentEmail, setLastSentEmail] = useState('')

  useEffect(() => {
    if (countdown <= 0) return
    const timer = window.setInterval(() => setCountdown((value) => Math.max(value - 1, 0)), 1000)
    return () => window.clearInterval(timer)
  }, [countdown])

  const handleSendCode = async () => {
    if (sendingCode || countdown > 0 || busy) return
    const normalizedEmail = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      onNotice('请输入正确的邮箱地址')
      return
    }
    setSendingCode(true)
    try {
      const result = await onSendCode(normalizedEmail, isRegistering ? 'register' : 'login')
      if (result.retryAfter && result.retryAfter > 0) setCountdown(result.retryAfter)
      if (result.ok) setLastSentEmail(normalizedEmail)
    } finally {
      setSendingCode(false)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    void onSubmit((mode === 'code' || isRegistering) ? verificationCode : undefined)
  }

  const switchView = () => setView(isRegistering ? 'login' : 'register')
  const switchMode = (nextMode: AuthMode) => setMode(nextMode)

  return <form className="auth-form" onSubmit={handleSubmit} aria-busy={busy} noValidate>
    <div className="auth-form-heading"><div><b>{isRegistering ? '创建你的账号' : '登录账号'}</b><small>{isRegistering ? '验证邮箱，开始同步你的快递' : '使用邮箱进入你的包裹空间'}</small></div>{isRegistering && <span className="new-account-tag">新用户</span>}</div>
    {backendUnavailable && <div className="auth-status-note" role="status"><CircleAlert size={15} /><span>{demoMode ? '后端暂未连接，当前可用本地演示验证码 123456' : '认证服务暂时不可用，请稍后重试'}</span></div>}
    <div className="auth-tabs" role="tablist" aria-label="登录方式"><button type="button" role="tab" aria-selected={mode === 'code'} className={mode === 'code' ? 'active' : ''} onClick={() => switchMode('code')}>{isRegistering ? '邮箱验证码注册' : '邮箱验证码登录'}</button><button type="button" role="tab" aria-selected={mode === 'password'} className={mode === 'password' ? 'active' : ''} onClick={() => switchMode('password')}>{isRegistering ? '密码注册' : '密码登录'}</button></div>
    <label htmlFor="auth-email">邮箱地址<input id="auth-email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" placeholder="请输入邮箱地址" required /></label>
    {(mode === 'code' || isRegistering) && <label htmlFor="auth-code">邮箱验证码<div className="code-input"><input id="auth-code" value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="输入 6 位验证码" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required /><button type="button" disabled={countdown > 0 || sendingCode || busy} onClick={() => void handleSendCode()}>{sendingCode ? '发送中…' : countdown > 0 ? `${countdown}s 后重发` : '获取验证码'}</button></div>{lastSentEmail && <small className="auth-hint" role="status">验证码已发送到 {maskEmail(lastSentEmail)}，5 分钟内有效</small>}</label>}
    {(mode === 'password' || isRegistering) && <label htmlFor="auth-password">{isRegistering ? '设置密码（可选）' : '登录密码'}<div className="password-input"><KeyRound size={16} /><input id="auth-password" value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? 'text' : 'password'} autoComplete={isRegistering ? 'new-password' : 'current-password'} maxLength={128} placeholder={isRegistering ? '可选，至少 6 位' : '请输入登录密码'} />{password && <button type="button" className="password-toggle" aria-label={showPassword ? '隐藏密码' : '显示密码'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>}</div></label>}
    {isRegistering && <small className="auth-hint auth-password-note">注册始终需要邮箱验证码；不设置密码也可以使用验证码登录。</small>}
    <button className="submit" type="submit" disabled={busy}>{busy ? <RefreshCw size={17} className="spin" /> : isRegistering ? <UserRound size={17} /> : <LogIn size={17} />} {busy ? '处理中…' : isRegistering ? '创建账号' : '进入我的包裹'}</button>
    <small className="terms">{isRegistering ? '注册即表示你同意《用户协议》和《隐私说明》' : '登录即表示你同意《用户协议》和《隐私说明》'}</small>
    <div className="auth-switch"><span>{isRegistering ? '已经有账号？' : '还没有账号？'}</span><button type="button" onClick={switchView}>{isRegistering ? '返回登录' : '注册账号'}</button></div>
  </form>
}

function LoginPage({ view, setView, mode, setMode, email, setEmail, password, setPassword, onSubmit, onNotice, onSendCode, busy, demoMode, backendUnavailable }: AuthFormProps) {
  return <div className="auth-screen"><div className="auth-panel"><div className="auth-brand"><span className="brand-mark"><PackageCheck size={20} /></span><b>驿见</b></div><div className="auth-copy"><div className="eyebrow"><Sparkles size={14} /> 主流快递，一处查看</div><h1>你的包裹，<br /><span>不必到处找。</span></h1><p>登录后同步你授权的快递平台，到站时及时提醒，取件码只为你保留。</p></div><AuthForm key={`${view}-${mode}`} view={view} setView={setView} mode={mode} setMode={setMode} email={email} setEmail={setEmail} password={password} setPassword={setPassword} onSubmit={onSubmit} onNotice={onNotice} onSendCode={onSendCode} busy={busy} demoMode={demoMode} backendUnavailable={backendUnavailable} /><div className="auth-safe"><ShieldCheck size={15} /> 我们只查询你本人授权的数据来源</div></div><div className="auth-art"><div className="mock-window"><div className="mock-bar"><i /><i /><i /></div><div className="mock-body"><div className="mock-card"><span /><span /><b><PackageCheck size={15} /> A6-219</b></div><div className="mock-row"><div /><div /></div></div></div><div className="mock-caption"><Eye size={16} /><div><b>隐私可见</b><small>取件码不会出现在系统通知里</small></div></div></div></div>
}

function LoginModal({ view, setView, mode, setMode, email, setEmail, password, setPassword, onSubmit, onNotice, onSendCode, busy, demoMode, backendUnavailable, onClose, onLogout }: AuthFormProps & { onClose: () => void; onLogout: () => void }) {
  return <div className="modal-layer" onClick={onClose}><div className="login-modal" role="dialog" aria-modal="true" aria-labelledby="account-dialog-title" onClick={(event) => event.stopPropagation()}><button className="modal-close" type="button" aria-label="关闭账号管理" onClick={onClose}><X size={18} /></button><div className="modal-icon"><UserRound size={20} /></div><small>账号管理</small><h2 id="account-dialog-title">{view === 'register' ? '注册账号' : '登录驿站'}</h2><p>{view === 'register' ? '邮箱验证后即可创建驿见账号' : `当前账号：${maskEmail(email)}`}</p><AuthForm key={`${view}-${mode}`} view={view} setView={setView} mode={mode} setMode={setMode} email={email} setEmail={setEmail} password={password} setPassword={setPassword} onSubmit={onSubmit} onNotice={onNotice} onSendCode={onSendCode} busy={busy} demoMode={demoMode} backendUnavailable={backendUnavailable} />{view === 'login' && <button className="modal-logout" type="button" onClick={onLogout}><LogOut size={15} /> 退出当前账号</button>}</div></div>
}
