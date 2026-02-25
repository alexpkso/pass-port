'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  BarChart,
  Bar,
  Legend,
} from 'recharts'

type Charge = {
  client_id: number
  start_date: string | null
  end_date: string | null
  created_at: string
}

function getWeekMonday(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const day = x.getDay()
  const monOffset = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + monOffset)
  return x
}

function getFirstServiceWeekMonday(startDate: Date): Date {
  const weekOfStart = getWeekMonday(startDate)
  const first = new Date(weekOfStart)
  first.setDate(first.getDate() + 7)
  return first
}

function getMonthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function getMonthEnd(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

function monthKey(d: Date): string {
  const m = getMonthStart(d)
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`
}

const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

export default function DashboardChurnCharts() {
  const [charges, setCharges] = useState<Charge[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('charges')
      .select('client_id, start_date, end_date, created_at')
      .then(({ data, error: err }) => {
        if (err) setError(err.message)
        else setCharges((data ?? []) as Charge[])
        setLoading(false)
      })
  }, [])

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Последние 12 месяцев
  const months: { key: string; label: string; monthStart: Date }[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const start = getMonthStart(d)
    months.push({
      key: monthKey(start),
      label: `${MONTHS_RU[start.getMonth()]} ${start.getFullYear()}`,
      monthStart: start,
    })
  }

  // По каждому клиенту: первая «неделя входа» (first service week), последняя дата окончания начисления
  const clientFirstMonth = new Map<number, string>()
  const clientLastChargeEnd = new Map<number, Date>()
  charges.forEach((c) => {
    const startStr = c.start_date || c.created_at
    const endStr = c.end_date || c.start_date || c.created_at
    if (!startStr) return
    const start = new Date(startStr)
    const end = endStr ? new Date(endStr) : new Date(start)
    start.setHours(0, 0, 0, 0)
    end.setHours(0, 0, 0, 0)
    const firstMonday = getFirstServiceWeekMonday(start)
    const monthStr = monthKey(firstMonday)
    if (!clientFirstMonth.has(c.client_id) || monthStr < clientFirstMonth.get(c.client_id)!)
      clientFirstMonth.set(c.client_id, monthStr)
    const cur = clientLastChargeEnd.get(c.client_id)
    if (!cur || end.getTime() > cur.getTime()) clientLastChargeEnd.set(c.client_id, end)
  })

  // Продлил ли клиент после даты endDate (есть ли начисление с start_date > endDate)
  const hasRenewalAfter = (clientId: number, endDate: Date): boolean =>
    charges.some(
      (c) => c.client_id === clientId && c.start_date && new Date(c.start_date).getTime() > endDate.getTime()
    )

  // Данные по месяцам: newClients, churned, atRisk, churnRate
  const chartData = months.map(({ key, label, monthStart }) => {
    const monthEnd = getMonthEnd(monthStart)
    let newClients = 0
    let churned = 0
    let atRisk = 0
    clientFirstMonth.forEach((firstMonth, clientId) => {
      if (firstMonth === key) newClients += 1
    })
    clientLastChargeEnd.forEach((lastEnd, clientId) => {
      if (lastEnd.getTime() < monthStart.getTime() || lastEnd.getTime() > monthEnd.getTime()) return
      atRisk += 1
      if (!hasRenewalAfter(clientId, lastEnd)) churned += 1
    })
    const churnRate = atRisk > 0 ? (churned / atRisk) * 100 : 0
    return {
      key,
      label,
      churnRate: Math.round(churnRate * 10) / 10,
      newClients,
      churned,
      atRisk,
    }
  })

  if (loading) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
        <h2 className="text-lg font-medium text-[var(--foreground)]">Расшифровка метрик: Churn Rate</h2>
        <p className="mt-4 text-[var(--muted)]">Загрузка…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
        <h2 className="text-lg font-medium text-[var(--foreground)]">Расшифровка метрик: Churn Rate</h2>
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          Ошибка загрузки: {error}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-[var(--foreground)]">Расшифровка метрик: Churn Rate</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Churn Rate — доля клиентов, не продливших услугу (среди тех, у кого период закончился в этом месяце).
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <h3 className="text-sm font-medium text-[var(--foreground)]">Churn Rate по месяцам, %</h3>
          <div className="mt-2 h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis domain={[0, 'auto']} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" unit="%" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number) => [`${value}%`, 'Churn Rate']}
                  labelFormatter={(label) => label}
                />
                <ReferenceLine y={5} stroke="#ef4444" strokeDasharray="5 5" strokeWidth={2} />
                <Line
                  type="monotone"
                  dataKey="churnRate"
                  name="Churn Rate"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">Красная пунктирная линия — порог 5%</p>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <h3 className="text-sm font-medium text-[var(--foreground)]">Новые и ушедшие по месяцам</h3>
          <div className="mt-2 h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                  }}
                  labelFormatter={(label) => label}
                />
                <Legend />
                <Bar dataKey="newClients" name="Новые клиенты" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="churned" name="Ушедшие" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
