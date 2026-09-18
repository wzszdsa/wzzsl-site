import { useEffect, useMemo, useState } from 'react'
import {
  Bell,
  BellRing,
  Check,
  Circle,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import './App.css'
import { createTodo, filterTodos, getTodoStatus, getTodosDueForReminder } from './todoUtils'

const STORAGE_KEY = 'todo-reminder.todos'
const emptyForm = {
  title: '',
  notes: '',
  reminderAt: '',
  priority: 'normal',
}
const filters = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '进行中' },
  { value: 'overdue', label: '已逾期' },
  { value: 'completed', label: '已完成' },
]
const priorityLabels = {
  low: '低',
  normal: '普通',
  high: '高',
}
const statusLabels = {
  active: '进行中',
  due: '到期',
  overdue: '逾期',
  completed: '完成',
}

function loadTodos() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : []
  } catch {
    return []
  }
}

function formatReminder(value) {
  if (!value) {
    return '未设置提醒'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function App() {
  const [todos, setTodos] = useState(loadTodos)
  const [form, setForm] = useState(emptyForm)
  const [filter, setFilter] = useState('all')
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')
  const [notificationPermission, setNotificationPermission] = useState(() =>
    'Notification' in window ? Notification.permission : 'unsupported',
  )
  const [now, setNow] = useState(() => new Date())
  const [alerts, setAlerts] = useState([])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos))
  }, [todos])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date())
    }, 30_000)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const dueTodos = getTodosDueForReminder(todos, now)

    if (dueTodos.length === 0) {
      return
    }

    setAlerts((current) => [
      ...dueTodos.map((todo) => ({
        id: `${todo.id}-${Date.now()}`,
        title: todo.title,
        reminderAt: todo.reminderAt,
      })),
      ...current,
    ])

    if (notificationPermission === 'granted') {
      dueTodos.forEach((todo) => {
        new Notification('待办提醒', {
          body: todo.title,
        })
      })
    }

    setTodos((current) =>
      current.map((todo) =>
        dueTodos.some((dueTodo) => dueTodo.id === todo.id) ? { ...todo, reminded: true } : todo,
      ),
    )
  }, [notificationPermission, now, todos])

  const visibleTodos = useMemo(() => filterTodos(todos, filter, now), [filter, now, todos])
  const stats = useMemo(
    () => ({
      total: todos.length,
      active: todos.filter((todo) => !todo.completed).length,
      overdue: todos.filter((todo) => getTodoStatus(todo, now) === 'overdue').length,
      completed: todos.filter((todo) => todo.completed).length,
    }),
    [now, todos],
  )

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
    setError('')
  }

  function resetForm() {
    setForm(emptyForm)
    setEditingId(null)
    setError('')
  }

  function submitTodo(event) {
    event.preventDefault()

    try {
      if (!form.title.trim()) {
        throw new Error('请输入待办标题')
      }

      if (editingId) {
        setTodos((current) =>
          current.map((todo) =>
            todo.id === editingId
              ? {
                  ...todo,
                  title: form.title.trim(),
                  notes: form.notes.trim(),
                  priority: form.priority,
                  reminderAt: form.reminderAt,
                  reminded: todo.reminderAt === form.reminderAt ? todo.reminded : false,
                }
              : todo,
          ),
        )
      } else {
        setTodos((current) => [createTodo(form), ...current])
      }

      resetForm()
    } catch (error) {
      setError(error.message)
    }
  }

  function toggleTodo(id) {
    setTodos((current) =>
      current.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed, reminded: todo.reminded } : todo,
      ),
    )
  }

  function deleteTodo(id) {
    setTodos((current) => current.filter((todo) => todo.id !== id))
    setAlerts((current) => current.filter((alert) => !alert.id.startsWith(id)))
    if (editingId === id) {
      resetForm()
    }
  }

  function startEditing(todo) {
    setForm({
      title: todo.title,
      notes: todo.notes,
      reminderAt: todo.reminderAt,
      priority: todo.priority,
    })
    setEditingId(todo.id)
    setError('')
  }

  async function requestNotifications() {
    if (!('Notification' in window)) {
      setNotificationPermission('unsupported')
      return
    }

    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">本地待办提醒</p>
          <h1>今天要处理什么？</h1>
        </div>
        <button type="button" className="notify-button" onClick={requestNotifications}>
          {notificationPermission === 'granted' ? <BellRing size={18} /> : <Bell size={18} />}
          {notificationPermission === 'granted' ? '通知已开启' : '开启通知'}
        </button>
      </section>

      {alerts.length > 0 && (
        <section className="alerts" aria-live="polite">
          {alerts.slice(0, 3).map((alert) => (
            <div className="alert" key={alert.id}>
              <BellRing size={18} />
              <div>
                <strong>{alert.title}</strong>
                <span>{formatReminder(alert.reminderAt)} 到期</span>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="关闭提醒"
                title="关闭提醒"
                onClick={() =>
                  setAlerts((current) => current.filter((item) => item.id !== alert.id))
                }
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </section>
      )}

      <section className="summary-grid" aria-label="待办统计">
        <div>
          <span>{stats.total}</span>
          <p>全部</p>
        </div>
        <div>
          <span>{stats.active}</span>
          <p>进行中</p>
        </div>
        <div>
          <span>{stats.overdue}</span>
          <p>已逾期</p>
        </div>
        <div>
          <span>{stats.completed}</span>
          <p>已完成</p>
        </div>
      </section>

      <section className="workspace">
        <form className="todo-form" onSubmit={submitTodo}>
          <div className="form-title">
            <h2>{editingId ? '编辑待办' : '添加待办'}</h2>
            {editingId && (
              <button type="button" className="text-button" onClick={resetForm}>
                <X size={16} />
                取消
              </button>
            )}
          </div>

          <label>
            标题
            <input
              type="text"
              value={form.title}
              placeholder="例如：16:00 给客户回电话"
              onChange={(event) => updateForm('title', event.target.value)}
            />
          </label>

          <label>
            备注
            <textarea
              value={form.notes}
              rows="4"
              placeholder="补充地点、材料或上下文"
              onChange={(event) => updateForm('notes', event.target.value)}
            />
          </label>

          <div className="form-row">
            <label>
              提醒时间
              <input
                type="datetime-local"
                value={form.reminderAt}
                onChange={(event) => updateForm('reminderAt', event.target.value)}
              />
            </label>
            <label>
              优先级
              <select
                value={form.priority}
                onChange={(event) => updateForm('priority', event.target.value)}
              >
                <option value="low">低</option>
                <option value="normal">普通</option>
                <option value="high">高</option>
              </select>
            </label>
          </div>

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="primary-button">
            {editingId ? <Save size={18} /> : <Plus size={18} />}
            {editingId ? '保存修改' : '添加待办'}
          </button>
        </form>

        <section className="todo-panel">
          <div className="panel-header">
            <h2>任务列表</h2>
            <div className="filter-tabs" role="tablist" aria-label="筛选待办">
              {filters.map((item) => (
                <button
                  type="button"
                  key={item.value}
                  className={filter === item.value ? 'active' : ''}
                  onClick={() => setFilter(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="todo-list">
            {visibleTodos.length === 0 ? (
              <div className="empty-state">
                <Circle size={26} />
                <p>当前筛选下没有待办</p>
              </div>
            ) : (
              visibleTodos.map((todo) => {
                const status = getTodoStatus(todo, now)

                return (
                  <article className={`todo-item ${status}`} key={todo.id}>
                    <button
                      type="button"
                      className="complete-button"
                      aria-label={todo.completed ? '标记为未完成' : '标记为完成'}
                      title={todo.completed ? '标记为未完成' : '标记为完成'}
                      onClick={() => toggleTodo(todo.id)}
                    >
                      {todo.completed ? <Check size={18} /> : <Circle size={18} />}
                    </button>
                    <div className="todo-content">
                      <div className="todo-line">
                        <h3>{todo.title}</h3>
                        <span className={`priority ${todo.priority}`}>
                          {priorityLabels[todo.priority]}
                        </span>
                      </div>
                      {todo.notes && <p>{todo.notes}</p>}
                      <div className="todo-meta">
                        <span>{formatReminder(todo.reminderAt)}</span>
                        <span>{statusLabels[status]}</span>
                      </div>
                    </div>
                    <div className="todo-actions">
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="编辑待办"
                        title="编辑待办"
                        onClick={() => startEditing(todo)}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-button danger"
                        aria-label="删除待办"
                        title="删除待办"
                        onClick={() => deleteTodo(todo.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </article>
                )
              })
            )}
          </div>
        </section>
      </section>
    </main>
  )
}

export default App
