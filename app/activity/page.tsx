'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import Nav from '../components/Nav'
import Breadcrumbs from '../components/Breadcrumbs'

type ActivityEntry = {
  id: number
  created_at: string
  entity_type: string
  entity_id: number
  action_type: string
  description: string
}

function getWeekMonday(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const day = x.getDay()
  const monOffset = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + monOffset)
  return x
}

function formatWeekRange(weekStart: Date): string {
  const end = new Date(weekStart)
  end.setDate(end.getDate() + 6)
  const fmt = (d: Date) =>
    d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
  return `${weekStart.getDate()}–${end.getDate()} ${weekStart.toLocaleDateString('ru-RU', { month: 'long' })} ${weekStart.getFullYear()}`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function ActivityPage() {
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    let cancelled = false
    setError(null)
    supabase
      .from('activity_log')
      .select('id, created_at, entity_type, entity_id, action_type, description')
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data, error: e }) => {
        if (cancelled) return
        if (e) {
          setError(e.message)
          setEntries([])
        } else {
          setEntries((data ?? []) as ActivityEntry[])
        }
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const byWeek = new Map<number, ActivityEntry[]>()
  entries.forEach((entry) => {
    const d = new Date(entry.created_at)
    const mon = getWeekMonday(d)
    const key = mon.getTime()
    if (!byWeek.has(key)) byWeek.set(key, [])
    byWeek.get(key)!.push(entry)
  })
  const weekStarts = Array.from(byWeek.keys()).sort((a, b) => b - a)

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Nav />
      <div className="mx-auto max-w-[84rem] px-4 py-8 sm:px-6">
        <Breadcrumbs
          items={[
            { href: '/', label: 'Главная' },
            { href: '/activity', label: 'Лог действий' },
          ]}
        />
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Лог действий
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Действия по справочникам (услуги, сотрудники, должности), сгруппированы по неделям.
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <p className="mt-6 text-[var(--muted)]">Загрузка…</p>
        ) : entries.length === 0 ? (
          <p className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 text-[var(--muted)]">
            Записей пока нет. Действия по справочникам (создание, изменение, удаление) будут отображаться здесь.
          </p>
        ) : (
          <section className="mt-8 space-y-10">
            {weekStarts.map((ts) => {
              const weekStart = new Date(ts)
              const weekEntries = byWeek.get(ts) ?? []
              return (
                <div
                  key={ts}
                  className="rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm overflow-hidden"
                >
                  <h2 className="bg-[var(--muted)]/10 px-4 py-3 text-base font-semibold text-[var(--foreground)] border-b border-[var(--border)]">
                    Неделя {formatWeekRange(weekStart)}
                  </h2>
                  <ul className="divide-y divide-[var(--border)]">
                    {weekEntries.map((e) => (
                      <li
                        key={e.id}
                        className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 text-sm hover:bg-[var(--muted)]/5"
                      >
                        <span className="shrink-0 text-[var(--muted)] tabular-nums">
                          {formatDate(e.created_at)} {formatTime(e.created_at)}
                        </span>
                        <span className="min-w-0 flex-1">{e.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </section>
        )}
      </div>
    </div>
  )
}
