import { describe, expect, it } from 'vitest'
import {
  createTodo,
  filterTodos,
  getTodoStatus,
  getTodosDueForReminder,
} from './todoUtils'

describe('todo utilities', () => {
  it('creates an active todo with a stable id and reminder metadata', () => {
    const todo = createTodo(
      {
        title: '提交周报',
        notes: '整理本周完成事项',
        reminderAt: '2026-08-17T09:30',
        priority: 'high',
      },
      { now: new Date('2026-08-17T08:00:00Z'), id: 'todo-1' },
    )

    expect(todo).toEqual({
      id: 'todo-1',
      title: '提交周报',
      notes: '整理本周完成事项',
      reminderAt: '2026-08-17T09:30',
      priority: 'high',
      completed: false,
      reminded: false,
      createdAt: '2026-08-17T08:00:00.000Z',
    })
  })

  it('rejects todos without a title', () => {
    expect(() =>
      createTodo(
        { title: '   ', notes: '', reminderAt: '', priority: 'normal' },
        { now: new Date('2026-08-17T08:00:00Z'), id: 'todo-1' },
      ),
    ).toThrow('请输入待办标题')
  })

  it('classifies active, due, overdue, and completed todos', () => {
    const now = new Date('2026-08-17T10:00:00')

    expect(getTodoStatus({ completed: true, reminderAt: '2026-08-17T08:00' }, now)).toBe(
      'completed',
    )
    expect(getTodoStatus({ completed: false, reminderAt: '2026-08-17T09:59' }, now)).toBe(
      'overdue',
    )
    expect(getTodoStatus({ completed: false, reminderAt: '2026-08-17T10:00' }, now)).toBe(
      'due',
    )
    expect(getTodoStatus({ completed: false, reminderAt: '2026-08-18T10:00' }, now)).toBe(
      'active',
    )
  })

  it('filters todos by all, active, completed, and overdue status', () => {
    const now = new Date('2026-08-17T10:00:00')
    const todos = [
      { id: '1', completed: false, reminderAt: '2026-08-18T10:00' },
      { id: '2', completed: true, reminderAt: '2026-08-16T10:00' },
      { id: '3', completed: false, reminderAt: '2026-08-17T09:00' },
    ]

    expect(filterTodos(todos, 'all', now).map((todo) => todo.id)).toEqual(['1', '2', '3'])
    expect(filterTodos(todos, 'active', now).map((todo) => todo.id)).toEqual(['1', '3'])
    expect(filterTodos(todos, 'completed', now).map((todo) => todo.id)).toEqual(['2'])
    expect(filterTodos(todos, 'overdue', now).map((todo) => todo.id)).toEqual(['3'])
  })

  it('returns uncompleted todos due for a reminder only once', () => {
    const now = new Date('2026-08-17T10:00:00')
    const todos = [
      { id: '1', completed: false, reminded: false, reminderAt: '2026-08-17T09:00' },
      { id: '2', completed: false, reminded: true, reminderAt: '2026-08-17T09:00' },
      { id: '3', completed: true, reminded: false, reminderAt: '2026-08-17T09:00' },
      { id: '4', completed: false, reminded: false, reminderAt: '2026-08-17T11:00' },
    ]

    expect(getTodosDueForReminder(todos, now).map((todo) => todo.id)).toEqual(['1'])
  })
})
