'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'

type WeekCount = { weekLabel: string; count: number; year: number; week: number }

function getWeekKey(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return { year: d.getUTCFullYear(), week: weekNo }
}

function formatWeekLabel(year: number, week: number): string {
  return `${year}, н. ${week}`
}

export default function DashboardWeeklyClients() {
  const [data, setData] = useState<WeekCount[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('clients')
      .select('created_at')
      .then(({ data: rows, error }) => {
        if (error) {
          setData([])
          setLoading(false)
          return
        }
        const byWeek = new Map<string, number>()
        const seen = new Set<string>()
        ;(rows ?? []).forEach((r: { created_at: string }) => {
          const { year, week } = getWeekKey(new Date(r.created_at))
          const key = `${year}-${week}`
          byWeek.set(key, (byWeek.get(key) ?? 0) + 1)
          seen.add(key)
        })
        const order = Array.from(seen)
          .map((k) => {
            const [y, w] = k.split('-').map(Number)
            return { year: y, week: w }
          })
          .sort((a, b) => a.year !== b.year ? a.year - b.year : a.week - b.week)
        const last = order.slice(-12)
        setData(
          last.map(({ year, week }) => ({
            weekLabel: formatWeekLabel(year, week),
            count: byWeek.get(`${year}-${week}`) ?? 0,
            year,
            week,
          }))
        )
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
        <h2 className="text-lg font-medium text-[var(--foreground)]">Клиенты по неделям</h2>
        <p className="mt-4 text-[var(--muted)]">Загрузка…</p>
      </div>
    )
  }

  const maxCount = Math.max(1, ...data.map((d) => d.count))

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
      <h2 className="text-lg font-medium text-[var(--foreground)]">Клиенты по неделям</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">Количество новых клиентов за последние недели</p>
      {data.length === 0 ? (
        <p className="mt-6 text-[var(--muted)]">Нет данных за выбранный период.</p>
      ) : (
        <div className="mt-6 flex items-end gap-1.5 h-48">
          {data.map((item) => (
            <div key={item.weekLabel} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full min-w-[8px] rounded-t bg-blue-500 transition-all"
                style={{ height: `${(item.count / maxCount) * 100}%`, minHeight: item.count ? 4 : 0 }}
                title={`${item.weekLabel}: ${item.count}`}
              />
              <span className="text-xs text-[var(--muted)] truncate max-w-full" title={item.weekLabel}>
                {item.week}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
