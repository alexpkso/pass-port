'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'

type Charge = {
  client_id: number
  start_date: string | null
  end_date: string | null
  amount: number
  created_at: string
}

type Payment = {
  client_id: number
  amount: number
}

function getWeekMonday(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const day = x.getDay()
  const monOffset = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + monOffset)
  return x
}

/** Услуга начинается со следующей недели после start_date. Первый понедельник оказания = понедельник недели start + 7 дней. */
function getFirstServiceWeekMonday(startDate: Date): Date {
  const weekOfStart = getWeekMonday(startDate)
  const first = new Date(weekOfStart)
  first.setDate(first.getDate() + 7)
  return first
}

function getMonthStart(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), 1)
  x.setHours(0, 0, 0, 0)
  return x
}

function getMonthEnd(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  x.setHours(23, 59, 59, 999)
  return x
}

const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

export default function DashboardSubscriptionMetrics() {
  const [charges, setCharges] = useState<Charge[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from('charges').select('client_id, start_date, end_date, amount, created_at'),
      supabase.from('payments').select('client_id, amount'),
    ]).then(([chargesRes, paymentsRes]) => {
      const err = chargesRes.error?.message ?? paymentsRes.error?.message ?? null
      if (err) setError(err)
      if (!chargesRes.error) setCharges((chargesRes.data ?? []) as Charge[])
      if (!paymentsRes.error) setPayments((paymentsRes.data ?? []) as Payment[])
      setLoading(false)
    })
  }, [])

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const currentMonthStart = getMonthStart(today)
  const currentMonthEnd = getMonthEnd(today)

  // По каждому начислению: первый понедельник оказания, последний понедельник, число недель, MRR-вклад (руб/мес)
  type ChargeMRR = { client_id: number; firstMonday: Date; lastMonday: Date; numWeeks: number; amountPerMonth: number }
  const chargeMRRs: ChargeMRR[] = []
  charges.forEach((c) => {
    const startStr = c.start_date || c.created_at
    const endStr = c.end_date || c.start_date || c.created_at
    if (!startStr) return
    const start = new Date(startStr)
    const end = endStr ? new Date(endStr) : new Date(start)
    start.setHours(0, 0, 0, 0)
    end.setHours(0, 0, 0, 0)
    const firstMonday = getFirstServiceWeekMonday(start)
    const lastMonday = getWeekMonday(end)
    if (firstMonday.getTime() > lastMonday.getTime()) {
      const numWeeks = 1
      const amountPerMonth = (Number(c.amount) / numWeeks) * (52 / 12)
      chargeMRRs.push({ client_id: c.client_id, firstMonday, lastMonday, numWeeks, amountPerMonth })
      return
    }
    let numWeeks = 0
    const cursor = new Date(firstMonday)
    while (cursor.getTime() <= lastMonday.getTime()) {
      numWeeks += 1
      cursor.setDate(cursor.getDate() + 7)
    }
    const amountPerMonth = numWeeks > 0 ? (Number(c.amount) / numWeeks) * (52 / 12) : 0
    chargeMRRs.push({ client_id: c.client_id, firstMonday, lastMonday, numWeeks, amountPerMonth })
  })

  // Активен в месяце M: firstMonday <= lastDayOfMonth && lastMonday >= firstDayOfMonth
  function mrrForMonth(monthStart: Date): number {
    const monthEnd = getMonthEnd(monthStart)
    return chargeMRRs.reduce((sum, r) => {
      if (r.firstMonday.getTime() <= monthEnd.getTime() && r.lastMonday.getTime() >= monthStart.getTime())
        return sum + r.amountPerMonth
      return sum
    }, 0)
  }

  const mrrCurrent = mrrForMonth(currentMonthStart)

  // Активные клиенты: хотя бы одно начисление с end_date >= сегодня
  const activeClientIds = new Set<number>()
  charges.forEach((c) => {
    const endStr = c.end_date || c.start_date || c.created_at
    if (!endStr) return
    const end = new Date(endStr)
    end.setHours(0, 0, 0, 0)
    if (end.getTime() >= today.getTime()) activeClientIds.add(c.client_id)
  })
  const activeClients = activeClientIds.size

  // Churn: клиенты, у которых последнее начисление закончилось (end_date < сегодня) и нет нового начисления после него
  const clientLastChargeEnd = new Map<number, Date>()
  charges.forEach((c) => {
    const endStr = c.end_date || c.start_date || c.created_at
    if (!endStr) return
    const end = new Date(endStr)
    end.setHours(0, 0, 0, 0)
    const cur = clientLastChargeEnd.get(c.client_id)
    if (!cur || end.getTime() > cur.getTime()) clientLastChargeEnd.set(c.client_id, end)
  })
  let endedCount = 0
  let churnedCount = 0
  clientLastChargeEnd.forEach((lastEnd, clientId) => {
    if (lastEnd.getTime() >= today.getTime()) return
    endedCount += 1
    const hasRenewal = charges.some(
      (c) => c.client_id === clientId && c.start_date && new Date(c.start_date).getTime() > lastEnd.getTime()
    )
    if (!hasRenewal) churnedCount += 1
  })
  const churnRate = endedCount > 0 ? (churnedCount / endedCount) * 100 : 0

  // ARPU = MRR / активные клиенты
  const arpu = activeClients > 0 ? mrrCurrent / activeClients : 0

  // LTV = средняя сумма начислений за всё время на клиента (по клиентам, у кого есть начисления)
  const totalChargedByClient = new Map<number, number>()
  charges.forEach((c) => {
    const cur = totalChargedByClient.get(c.client_id) ?? 0
    totalChargedByClient.set(c.client_id, cur + Number(c.amount))
  })
  const clientsWithCharges = totalChargedByClient.size
  const totalChargedAll = Array.from(totalChargedByClient.values()).reduce((a, b) => a + b, 0)
  const ltv = clientsWithCharges > 0 ? totalChargedAll / clientsWithCharges : 0

  // Долг: начислено − оплачено
  const totalCharged = charges.reduce((s, c) => s + Number(c.amount), 0)
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0)
  const debt = totalCharged - totalPaid

  // MRR по месяцам (последние 12 месяцев)
  const mrrByMonth: { label: string; mrr: number; monthStart: Date }[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const monthStart = getMonthStart(d)
    mrrByMonth.push({
      label: `${MONTHS_RU[monthStart.getMonth()]} ${monthStart.getFullYear()}`,
      mrr: mrrForMonth(monthStart),
      monthStart,
    })
  }
  const maxMrr = Math.max(...mrrByMonth.map((m) => m.mrr), 1)

  // MRR прошлого месяца для роста
  const mrrPrevMonth = mrrByMonth.length >= 2 ? mrrByMonth[mrrByMonth.length - 2].mrr : 0
  const mrrGrowthPct = mrrPrevMonth > 0 ? ((mrrCurrent - mrrPrevMonth) / mrrPrevMonth) * 100 : 0

  // Долг от MRR (%)
  const debtToMrrPct = mrrCurrent > 0 ? (debt / mrrCurrent) * 100 : (debt > 0 ? Infinity : 0)

  // Retention Rate = 100 - Churn (доля продливших среди тех, у кого период закончился)
  const retentionRate = endedCount > 0 ? 100 - churnRate : 100

  // LTV/ARPU (месяцев)
  const ltvArpuRatio = arpu > 0 ? ltv / arpu : 0

  type Status = 'green' | 'yellow' | 'red' | null
  function statusChurnRate(v: number): Status {
    if (v < 5) return 'green'
    if (v <= 10) return 'yellow'
    return 'red'
  }
  function statusRetentionRate(v: number): Status {
    if (v > 85) return 'green'
    if (v >= 70) return 'yellow'
    return 'red'
  }
  function statusDebtToMrr(v: number): Status {
    if (v === Infinity || v > 15) return 'red'
    if (v < 5) return 'green'
    return 'yellow'
  }
  function statusMrrGrowth(v: number): Status {
    if (v > 5) return 'green'
    if (v >= 0) return 'yellow'
    return 'red'
  }
  function statusLtvArpu(v: number): Status {
    if (v >= 12) return 'green'
    if (v >= 6) return 'yellow'
    return 'red'
  }

  const formatMoney = (n: number) =>
    new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + ' ₽'

  const cardStatusClasses: Record<Exclude<Status, null> | 'neutral', { bg: string; border: string; value: string }> = {
    green: {
      bg: 'bg-emerald-50 dark:bg-emerald-950/25',
      border: 'border-emerald-200 dark:border-emerald-800',
      value: 'text-emerald-700 dark:text-emerald-300',
    },
    yellow: {
      bg: 'bg-amber-50 dark:bg-amber-950/25',
      border: 'border-amber-200 dark:border-amber-800',
      value: 'text-amber-700 dark:text-amber-300',
    },
    red: {
      bg: 'bg-red-50 dark:bg-red-950/25',
      border: 'border-red-200 dark:border-red-800',
      value: 'text-red-700 dark:text-red-300',
    },
    neutral: {
      bg: 'bg-[var(--muted)]/5',
      border: 'border-[var(--border)]',
      value: 'text-[var(--foreground)]',
    },
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
        <h2 className="text-lg font-medium text-[var(--foreground)]">Метрики подписной модели</h2>
        <p className="mt-4 text-[var(--muted)]">Загрузка…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
        <h2 className="text-lg font-medium text-[var(--foreground)]">Метрики подписной модели</h2>
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          Ошибка загрузки: {error}
        </p>
      </div>
    )
  }

  const cards: { title: string; value: string; desc: string; status: Status }[] = [
    { title: 'MRR', value: formatMoney(mrrCurrent), desc: 'Активные подписки за месяц', status: null },
    {
      title: 'MRR рост',
      value: mrrGrowthPct > 0 ? `+${mrrGrowthPct.toFixed(1)}%` : mrrGrowthPct.toFixed(1) + '%',
      desc: 'К прошлому месяцу',
      status: statusMrrGrowth(mrrGrowthPct),
    },
    {
      title: 'Churn Rate',
      value: churnRate.toFixed(1) + '%',
      desc: 'Клиенты не продлившие услугу',
      status: statusChurnRate(churnRate),
    },
    {
      title: 'Retention Rate',
      value: retentionRate.toFixed(1) + '%',
      desc: 'Доля продливших среди завершивших период',
      status: statusRetentionRate(retentionRate),
    },
    { title: 'ARPU', value: formatMoney(arpu), desc: 'Средний доход на клиента в месяц', status: null },
    { title: 'LTV', value: formatMoney(ltv), desc: 'Средняя сумма за всё время на клиента', status: null },
    {
      title: 'LTV/ARPU',
      value: arpu > 0 ? ltvArpuRatio.toFixed(1) + '×' : '—',
      desc: 'Месяцев окупаемости (зел. >12, жёлт. 6–12, красн. <6)',
      status: arpu > 0 ? statusLtvArpu(ltvArpuRatio) : null,
    },
    { title: 'Активные клиенты', value: String(activeClients), desc: 'Срок услуги не истёк', status: null },
    {
      title: 'Долг',
      value: formatMoney(debt),
      desc: 'Начислено − оплачено (цвет: долг от MRR %)',
      status: statusDebtToMrr(debtToMrrPct),
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-[var(--foreground)]">Метрики подписной модели</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          MRR и активность считаются по начислениям (услуга со следующей недели после даты начала).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((card) => {
          const sc = cardStatusClasses[card.status ?? 'neutral']
          return (
            <div
              key={card.title}
              className={`rounded-xl border p-4 shadow-sm transition-all duration-200 ease-out hover:-translate-y-1 hover:scale-[1.02] hover:shadow-md ${sc.bg} ${sc.border}`}
            >
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{card.title}</p>
              <p className={`mt-1 text-xl font-semibold tabular-nums ${sc.value}`}>{card.value}</p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">{card.desc}</p>
            </div>
          )
        })}
      </div>

      <div>
        <h3 className="text-sm font-medium text-[var(--foreground)]">MRR по месяцам</h3>
        <div className="mt-2 flex items-end gap-1 rounded-lg border border-[var(--border)] bg-[var(--muted)]/5 p-4">
          {mrrByMonth.map((m) => (
            <div key={m.label} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full min-w-0 rounded-t bg-blue-500/80 transition-opacity hover:bg-blue-500"
                style={{ height: Math.max(4, (m.mrr / maxMrr) * 120) }}
                title={`${m.label}: ${formatMoney(m.mrr)}`}
              />
              <span className="truncate text-[10px] text-[var(--muted)]" title={m.label}>
                {MONTHS_RU[m.monthStart.getMonth()]} {m.monthStart.getFullYear()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
