export function createTodo(input, options = {}) {
  const title = input.title.trim()

  if (!title) {
    throw new Error('请输入待办标题')
  }

  const now = options.now ?? new Date()

  return {
    id: options.id ?? crypto.randomUUID(),
    title,
    notes: input.notes.trim(),
    reminderAt: input.reminderAt,
    priority: input.priority,
    completed: false,
    reminded: false,
    createdAt: now.toISOString(),
  }
}

export function getTodoStatus(todo, now = new Date()) {
  if (todo.completed) {
    return 'completed'
  }

  if (!todo.reminderAt) {
    return 'active'
  }

  const reminderTime = new Date(todo.reminderAt).getTime()
  const currentTime = now.getTime()

  if (Number.isNaN(reminderTime) || reminderTime > currentTime) {
    return 'active'
  }

  if (reminderTime === currentTime) {
    return 'due'
  }

  return 'overdue'
}

export function filterTodos(todos, filter, now = new Date()) {
  if (filter === 'all') {
    return todos
  }

  if (filter === 'active') {
    return todos.filter((todo) => !todo.completed)
  }

  if (filter === 'completed') {
    return todos.filter((todo) => todo.completed)
  }

  if (filter === 'overdue') {
    return todos.filter((todo) => getTodoStatus(todo, now) === 'overdue')
  }

  return todos
}

export function getTodosDueForReminder(todos, now = new Date()) {
  return todos.filter((todo) => {
    if (todo.completed || todo.reminded || !todo.reminderAt) {
      return false
    }

    const reminderTime = new Date(todo.reminderAt).getTime()

    return !Number.isNaN(reminderTime) && reminderTime <= now.getTime()
  })
}
