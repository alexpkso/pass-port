'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/client'

function getWeekMonday(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const day = x.getDay()
  const monOffset = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + monOffset)
  return x
}

const CHART_HEIGHT_PX = 180
const WINDOW_WEEKS = 25
const BAR_WIDTH_PX = 28
const YEAR_SHADES = ['#fce7f3', '#fbcfe8', '#f9a8d4', '#f472b6', '#ec4899']

const Y_STEP = 5

function getYTicks(maxVal: number): number[] {
  if (maxVal <= 0) return [0]
  const top = Math.ceil(maxVal / Y_STEP) * Y_STEP
  const ticks: number[] = []
  for (let v = 0; v <= top; v += Y_STEP) ticks.push(v)
  return ticks
}

type ChargeRow = { client_id: number; start_date: string | null; end_date: string | null; created_at: string }

export default function DashboardWeeklyClients() {
  const [charges, setCharges] = useState<ChargeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [scrollPos, setScrollPos] = useState<number | null>(null)
  const [drag, setDrag] = useState<{ x: number; startIndex: number } | null>(null)
  const chartScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('charges')
      .select('client_id, start_date, end_date, created_at')
      .then(({ data, error }) => {
        if (error) setCharges([])
        else setCharges((data ?? []) as ChargeRow[])
        setLoading(false)
      })
  }, [])

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const currentWeekMonday = getWeekMonday(today)
  const currentWeekKey = currentWeekMonday.toISOString().slice(0, 10)

  const byWeek = new Map<string, Set<number>>()
  charges.forEach((c) => {
    const startStr = c.start_date || c.created_at
    const endStr = c.end_date || c.start_date || c.created_at
    if (!startStr) return
    const start = new Date(startStr)
    const end = endStr ? new Date(endStr) : new Date(start)
    start.setHours(0, 0, 0, 0)
    end.setHours(0, 0, 0, 0)
    const weekEnd = getWeekMonday(end)
    const weekOfStart = getWeekMonday(start)
    const firstWeekMonday = new Date(weekOfStart)
    firstWeekMonday.setDate(firstWeekMonday.getDate() + 7)
    if (firstWeekMonday.getTime() > weekEnd.getTime()) {
      const key = weekEnd.toISOString().slice(0, 10)
      if (!byWeek.has(key)) byWeek.set(key, new Set())
      byWeek.get(key)!.add(c.client_id)
      return
    }
    const cursor = new Date(firstWeekMonday)
    while (cursor.getTime() <= weekEnd.getTime()) {
      const key = cursor.toISOString().slice(0, 10)
      if (!byWeek.has(key)) byWeek.set(key, new Set())
      byWeek.get(key)!.add(c.client_id)
      cursor.setDate(cursor.getDate() + 7)
    }
  })

  const dataWeeks = Array.from(byWeek.keys()).sort()
  const firstDataWeek = dataWeeks[0]
  const lastDataWeek = dataWeeks[dataWeeks.length - 1]
  const earliest = firstDataWeek ? new Date(firstDataWeek) : new Date(currentWeekMonday)
  const latest = lastDataWeek ? new Date(lastDataWeek) : new Date(currentWeekMonday)
  earliest.setDate(earliest.getDate() - 4 * 7)
  latest.setDate(latest.getDate() + 4 * 7)
  const allWeekKeys: string[] = []
  const cursor = new Date(getWeekMonday(earliest))
  while (cursor.getTime() <= latest.getTime()) {
    allWeekKeys.push(cursor.toISOString().slice(0, 10))
    cursor.setDate(cursor.getDate() + 7)
  }

  const windowSize = Math.min(WINDOW_WEEKS, allWeekKeys.length)
  const maxStart = Math.max(0, allWeekKeys.length - windowSize)
  const currentWeekIndex = allWeekKeys.indexOf(currentWeekKey)
  const centerStartIndex = currentWeekIndex >= 0 ? Math.max(0, Math.min(currentWeekIndex - 12, maxStart)) : 0
  const effectiveScrollPos = scrollPos === null ? (maxStart > 0 ? centerStartIndex / maxStart : 0) : scrollPos
  const startIndex = Math.min(maxStart, Math.round(effectiveScrollPos * maxStart))
  const weekKeys = allWeekKeys.slice(startIndex, startIndex + windowSize)

  const counts = weekKeys.map((k) => byWeek.get(k)?.size ?? 0)
  const dataMax = Math.max(0, ...counts)
  const yTicks = getYTicks(dataMax)
  const yMax = Math.max(1, yTicks[yTicks.length - 1] ?? 1)

  const datePart = (key: string) => {
    const [, m, d] = key.split('-').map(Number)
    return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}`
  }
  const yearPart = (key: string) => key.slice(0, 4)
  const yearsInView = Array.from(new Set(weekKeys.map(yearPart))).sort()
  const yearToShade: Record<string, string> = {}
  yearsInView.forEach((y, i) => {
    yearToShade[y] = YEAR_SHADES[i % YEAR_SHADES.length]
  })

  useEffect(() => {
    if (!drag) return
    const onMove = (e: MouseEvent) => {
      const deltaPx = e.clientX - drag.x
      const deltaWeeks = -Math.round(deltaPx / BAR_WIDTH_PX)
      const newStartIndex = Math.max(0, Math.min(maxStart, drag.startIndex + deltaWeeks))
      const newPos = maxStart > 0 ? newStartIndex / maxStart : 0
      setScrollPos(newPos)
    }
    const onUp = () => setDrag(null)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [drag, maxStart])

  const onChartMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    setDrag({ x: e.clientX, startIndex })
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
        <h2 className="text-lg font-medium text-[var(--foreground)]">Действующие клиенты по неделям</h2>
        <p className="mt-4 text-[var(--muted)]">Загрузка…</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium text-[var(--foreground)]">Действующие клиенты по неделям</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          В каждом столбце — число клиентов, которым оказывали услуги на этой неделе (по начислениям).
        </p>
      </div>

      <div
        ref={chartScrollRef}
        className="overflow-x-auto select-none"
        style={{ cursor: drag ? 'grabbing' : 'grab' }}
        onMouseDown={onChartMouseDown}
      >
        <div className="inline-flex flex-col pt-2">
          {/* Строка: ось Y + столбики */}
          <div className="flex items-end gap-0.5" style={{ height: CHART_HEIGHT_PX }}>
            <div
              className="flex w-14 flex-col justify-between pr-2 text-right text-xs text-[var(--muted)] shrink-0"
              style={{ height: CHART_HEIGHT_PX }}
            >
              {yTicks.slice().reverse().map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
            <div className="relative flex items-end gap-0.5" style={{ height: CHART_HEIGHT_PX }}>
              <div className="absolute inset-0 pointer-events-none" style={{ height: CHART_HEIGHT_PX }} aria-hidden>
                {yTicks.filter((t) => t > 0).map((tick) => (
                  <div
                    key={tick}
                    className="absolute left-0 right-0 border-b border-zinc-200 dark:border-zinc-600"
                    style={{ bottom: `${(tick / yMax) * 100}%` }}
                  />
                ))}
              </div>
              {weekKeys.map((key, i) => {
                const count = counts[i]
                const weekMonday = new Date(key)
                const isFuture = weekMonday > today
                const isCurrent = key === currentWeekKey
                const barHeightPx =
                  yMax > 0 && count > 0 ? Math.min(CHART_HEIGHT_PX, (count / yMax) * CHART_HEIGHT_PX) : 0
                return (
                  <div key={key} className="flex w-7 flex-shrink-0 flex-col justify-end" style={{ height: CHART_HEIGHT_PX }}>
                    {barHeightPx > 0 && (
                      <div
                        className={`w-full rounded-t overflow-hidden border ${isCurrent ? 'border-2 border-blue-500' : 'border border-zinc-300 dark:border-zinc-600'}`}
                        style={{
                          height: barHeightPx,
                          borderStyle: isFuture ? 'dashed' : 'solid',
                          background: isFuture
                            ? 'repeating-linear-gradient(-45deg, #93c5fd, #93c5fd 2px, transparent 2px, transparent 4px)'
                            : '#3b82f6',
                        }}
                        title={`Неделя ${key}: ${count} клиентов`}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          {/* Линия нуля */}
          <div className="flex gap-0.5 border-t-2 border-zinc-400 dark:border-zinc-500 mt-0">
            <div className="w-14 shrink-0" />
            <div className="flex gap-0.5 flex-1 min-w-0" aria-hidden>
              {weekKeys.map((key) => (
                <div key={key} className="w-7 flex-shrink-0" />
              ))}
            </div>
          </div>
          {/* Подписи дат — ниже линии нуля */}
          <div className="flex gap-0.5 pb-2 mt-0.5">
            <div className="w-14 shrink-0" />
            <div className="flex gap-0.5 flex-1 min-w-0">
              {weekKeys.map((key) => {
                const isCurrent = key === currentWeekKey
                return (
                  <div key={key} className="flex w-7 flex-shrink-0 flex-col items-center text-center">
                    <span
                      className={`block text-[10px] leading-tight ${isCurrent ? 'font-semibold text-blue-600 dark:text-blue-400' : 'text-[var(--muted)]'}`}
                      title={isCurrent ? 'Текущая неделя' : key}
                    >
                      {datePart(key)}
                    </span>
                    <span
                      className="mt-0.5 block w-full rounded px-0.5 py-0.5 text-[9px] font-medium leading-tight text-[var(--muted-foreground)]"
                      style={{ backgroundColor: yearToShade[yearPart(key)] ?? YEAR_SHADES[0] }}
                      title={yearPart(key)}
                    >
                      {yearPart(key)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {charges.length === 0 && (
        <p className="text-sm text-[var(--muted)]">Нет начислений — добавьте начисления в карточках клиентов.</p>
      )}
    </div>
  )
}
