import {
  PrismaClient,
  type Prisma,
  TaskPriority,
  TaskStatus,
  UserRole,
  BoardMemberRole,
  AutomationTrigger,
} from '@prisma/client'
import argon2 from 'argon2'

const prisma = new PrismaClient()

const DEMO_PASSWORD = 'Demo1234!'

async function main() {
  console.log('🌱 Seeding database…')

  const passwordHash = await argon2.hash(DEMO_PASSWORD)

  // ── Users (idempotent via upsert by email) ────────────────────────
  const admin = await prisma.user.upsert({
    where: { email: 'admin@demo.com' },
    update: {},
    create: {
      email: 'admin@demo.com',
      name: 'Алексей (Admin)',
      passwordHash,
      role: UserRole.ADMIN,
      avatarUrl: 'https://api.dicebear.com/9.x/initials/svg?seed=Alex',
    },
  })
  const tanya = await prisma.user.upsert({
    where: { email: 'tanya@demo.com' },
    update: {},
    create: {
      email: 'tanya@demo.com',
      name: 'Таня (PM)',
      passwordHash,
      role: UserRole.MEMBER,
      avatarUrl: 'https://api.dicebear.com/9.x/initials/svg?seed=Tanya',
    },
  })
  const dmitry = await prisma.user.upsert({
    where: { email: 'dmitry@demo.com' },
    update: {},
    create: {
      email: 'dmitry@demo.com',
      name: 'Дмитрий (Dev)',
      passwordHash,
      role: UserRole.MEMBER,
      avatarUrl: 'https://api.dicebear.com/9.x/initials/svg?seed=Dmitry',
    },
  })
  console.log(`  ✓ users: ${admin.email}, ${tanya.email}, ${dmitry.email}`)

  // ── Board (idempotent via upsert by slug) ─────────────────────────
  const board = await prisma.board.upsert({
    where: { slug: 'smart-kanban-demo' },
    update: { name: 'Smart Kanban Demo' },
    create: {
      name: 'Smart Kanban Demo',
      slug: 'smart-kanban-demo',
      description: 'Demo-доска для презентации Smart Kanban',
      isPublic: true,
      ownerId: admin.id,
    },
  })
  console.log(`  ✓ board: ${board.name} (${board.slug})`)

  // Reset board contents to keep seed strictly idempotent
  await prisma.$transaction([
    prisma.activityLog.deleteMany({ where: { boardId: board.id } }),
    prisma.automationRule.deleteMany({ where: { boardId: board.id } }),
    prisma.task.deleteMany({ where: { boardId: board.id } }),
    prisma.column.deleteMany({ where: { boardId: board.id } }),
    prisma.boardMember.deleteMany({ where: { boardId: board.id } }),
  ])

  // ── Board members ─────────────────────────────────────────────────
  await prisma.boardMember.createMany({
    data: [
      { boardId: board.id, userId: admin.id, role: BoardMemberRole.OWNER },
      { boardId: board.id, userId: tanya.id, role: BoardMemberRole.ADMIN },
      { boardId: board.id, userId: dmitry.id, role: BoardMemberRole.MEMBER },
    ],
  })

  // ── Columns ───────────────────────────────────────────────────────
  const columnsData: Prisma.ColumnCreateManyInput[] = [
    { boardId: board.id, name: 'Backlog', color: '#94a3b8', position: 0 },
    { boardId: board.id, name: 'To Do', color: '#3b82f6', position: 1, isDefault: true },
    { boardId: board.id, name: 'In Progress', color: '#f59e0b', position: 2, wipLimit: 3 },
    { boardId: board.id, name: 'Review', color: '#a855f7', position: 3 },
    { boardId: board.id, name: 'Done', color: '#22c55e', position: 4 },
  ]
  await prisma.column.createMany({ data: columnsData })
  const columns = await prisma.column.findMany({
    where: { boardId: board.id },
    orderBy: { position: 'asc' },
  })
  const col = (name: string) => {
    const found = columns.find((c) => c.name === name)
    if (!found) throw new Error(`Column "${name}" not found after seed`)
    return found.id
  }
  console.log(`  ✓ columns: ${columns.map((c) => c.name).join(' → ')}`)

  // ── Tasks (15+) ────────────────────────────────────────────────────
  const now = Date.now()
  const inDay = (n: number) => new Date(now + n * 24 * 60 * 60 * 1000)

  type T = Omit<Prisma.TaskCreateManyInput, 'boardId' | 'creatorId'> & {
    creatorId: string
  }
  const tasks: T[] = [
    // Backlog (3)
    {
      columnId: col('Backlog'),
      title: 'Подготовить спецификацию API авторизации',
      description: 'JWT + refresh, rate-limit, описать в Swagger.',
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.TODO,
      position: 0,
      tags: ['docs', 'auth'],
      creatorId: tanya.id,
      assigneeId: dmitry.id,
    },
    {
      columnId: col('Backlog'),
      title: 'Исследовать стоимость Anthropic API на нагрузке',
      description: 'Прикинуть, сколько токенов уйдёт на ежедневные выжимки.',
      priority: TaskPriority.LOW,
      status: TaskStatus.TODO,
      position: 1,
      tags: ['research', 'ai'],
      creatorId: admin.id,
    },
    {
      columnId: col('Backlog'),
      title: 'Подключить Sentry для фронта и бэка',
      priority: TaskPriority.LOW,
      status: TaskStatus.TODO,
      position: 2,
      tags: ['observability'],
      creatorId: admin.id,
    },

    // To Do (4) — два с дедлайном через 24ч
    {
      columnId: col('To Do'),
      title: 'Реализовать DnD карточек между колонок',
      description: 'Использовать @dnd-kit/core, оптимистичные обновления.',
      priority: TaskPriority.HIGH,
      status: TaskStatus.TODO,
      position: 0,
      tags: ['frontend', 'kanban'],
      dueDate: inDay(1),
      creatorId: tanya.id,
      assigneeId: dmitry.id,
    },
    {
      columnId: col('To Do'),
      title: 'Падает чек-аут на проде, корзина пустая',
      description: 'Воспроизводится у пользователей с iOS Safari 17.',
      priority: TaskPriority.CRITICAL,
      status: TaskStatus.TODO,
      position: 1,
      tags: ['баг', 'frontend', 'p0'],
      dueDate: inDay(1),
      creatorId: admin.id,
      assigneeId: dmitry.id,
    },
    {
      columnId: col('To Do'),
      title: 'Презентация для жюри ЮНИТХАК',
      priority: TaskPriority.HIGH,
      status: TaskStatus.TODO,
      position: 2,
      tags: ['demo'],
      creatorId: tanya.id,
      assigneeId: tanya.id,
    },
    {
      columnId: col('To Do'),
      title: 'Настроить CI на GitHub Actions',
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.TODO,
      position: 3,
      tags: ['devops'],
      creatorId: admin.id,
    },

    // In Progress (3, упирается в WIP=3) — один с тегом баг
    {
      columnId: col('In Progress'),
      title: 'Сломалась подписка на Socket.IO после реконнекта',
      description: 'После потери wifi клиент перестаёт получать события.',
      priority: TaskPriority.HIGH,
      status: TaskStatus.IN_PROGRESS,
      position: 0,
      tags: ['баг', 'realtime'],
      creatorId: tanya.id,
      assigneeId: dmitry.id,
    },
    {
      columnId: col('In Progress'),
      title: 'AI-декомпозиция задачи на чек-лист',
      description: 'Кнопка «🤖 Разбить через AI», превью, принять/изменить.',
      priority: TaskPriority.HIGH,
      status: TaskStatus.IN_PROGRESS,
      position: 1,
      tags: ['ai', 'frontend'],
      creatorId: admin.id,
      assigneeId: dmitry.id,
    },
    {
      columnId: col('In Progress'),
      title: 'AutomationRuleBuilder UI',
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.IN_PROGRESS,
      position: 2,
      tags: ['frontend', 'automation'],
      creatorId: tanya.id,
      assigneeId: tanya.id,
    },

    // Review (3)
    {
      columnId: col('Review'),
      title: 'Endpoint POST /api/queue/tasks с дедупликацией',
      description: 'SHA256(title + source + floor(unixtime/3600)), 409 на дубль.',
      priority: TaskPriority.HIGH,
      status: TaskStatus.REVIEW,
      position: 0,
      tags: ['backend', 'queue'],
      creatorId: tanya.id,
      assigneeId: dmitry.id,
    },
    {
      columnId: col('Review'),
      title: 'Telegram /start через magic-link',
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.REVIEW,
      position: 1,
      tags: ['bot'],
      creatorId: admin.id,
      assigneeId: dmitry.id,
    },
    {
      columnId: col('Review'),
      title: 'Не отображаются аватары онлайн-пользователей',
      priority: TaskPriority.LOW,
      status: TaskStatus.REVIEW,
      position: 2,
      tags: ['баг', 'frontend'],
      creatorId: tanya.id,
      assigneeId: dmitry.id,
    },

    // Done (3)
    {
      columnId: col('Done'),
      title: 'Prisma schema по разделу 3 SPEC.md',
      priority: TaskPriority.HIGH,
      status: TaskStatus.DONE,
      position: 0,
      tags: ['backend', 'db'],
      creatorId: admin.id,
      assigneeId: dmitry.id,
    },
    {
      columnId: col('Done'),
      title: 'docker-compose со всеми сервисами',
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.DONE,
      position: 1,
      tags: ['devops'],
      creatorId: admin.id,
    },
    {
      columnId: col('Done'),
      title: 'Структура монорепо (pnpm workspaces)',
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.DONE,
      position: 2,
      tags: ['devops'],
      creatorId: admin.id,
    },
  ]

  // Создаём задачи последовательно (нужны их id для чек-листов)
  const createdTasks = await Promise.all(
    tasks.map((t) => prisma.task.create({ data: { ...t, boardId: board.id } })),
  )
  console.log(`  ✓ tasks: ${createdTasks.length} created`)

  // ── Checklist items — для трёх задач из In Progress / Review ──────
  const withChecklists: Array<{ taskTitle: string; items: string[] }> = [
    {
      taskTitle: 'AI-декомпозиция задачи на чек-лист',
      items: [
        'Спроектировать промпт для декомпозиции',
        'Реализовать endpoint /api/ai/decompose',
        'Добавить fallback на невалидный JSON',
        'UI: кнопка + превью + принять/изменить',
        'Юнит-тесты парсера',
      ],
    },
    {
      taskTitle: 'Endpoint POST /api/queue/tasks с дедупликацией',
      items: [
        'Zod-схема входных данных',
        'Расчёт dedupHash (sha256)',
        'Worker для AI-обогащения',
        'Интеграционный тест на 409',
      ],
    },
    {
      taskTitle: 'AutomationRuleBuilder UI',
      items: [
        'Конструктор trigger / conditions / actions',
        'Preview человекочитаемого описания',
        'Кнопка «Тестировать»',
      ],
    },
  ]
  for (const { taskTitle, items } of withChecklists) {
    const task = createdTasks.find((t) => t.title === taskTitle)
    if (!task) continue
    await prisma.checklistItem.createMany({
      data: items.map((text, idx) => ({
        taskId: task.id,
        text,
        position: idx,
        done: idx === 0,
      })),
    })
  }
  console.log(`  ✓ checklists: ${withChecklists.length} tasks populated`)

  // ── Automation rules (раздел 6 SPEC.md) ───────────────────────────
  await prisma.automationRule.createMany({
    data: [
      {
        boardId: board.id,
        name: 'Баги — в приоритет',
        isActive: true,
        trigger: AutomationTrigger.TAG_ADDED,
        conditions: [{ field: 'tag', operator: 'contains', value: 'баг' }],
        actions: [{ type: 'move_to_top', params: {} }],
      },
      {
        boardId: board.id,
        name: 'Задача завершена',
        isActive: true,
        trigger: AutomationTrigger.TASK_MOVED,
        conditions: [{ field: 'columnId', operator: 'equals', value: col('Done') }],
        actions: [
          {
            type: 'notify_user',
            params: { target: 'creator', message: 'Ваша задача завершена!' },
          },
        ],
      },
      {
        boardId: board.id,
        name: 'Напоминание о дедлайне',
        isActive: true,
        trigger: AutomationTrigger.DUE_DATE_APPROACHING,
        conditions: [{ field: 'dueDate', operator: 'before', value: '24h' }],
        actions: [{ type: 'send_telegram', params: { target: 'assignee' } }],
      },
    ],
  })
  console.log(`  ✓ automation rules: 3 created`)

  console.log('✅ Seed complete')
}

main()
  .catch((err: unknown) => {
    console.error('❌ Seed failed:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
