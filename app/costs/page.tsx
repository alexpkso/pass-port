'use client'

import React, { useEffect, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import Nav from '../components/Nav'

// ─── Типы ────────────────────────────────────────────────────────────────────

type Employee = { id: number; name: string }
type Client = {
  id: number
  name: string
  manager_id: number | null
  employees: Employee | Employee[] | null
}
type Rates = {
  setup: number
  growth: number
  plateau: number
  decline: number
  lead: number
  signing: number
}
type Performance = 'growth' | 'plateau' | 'decline'
type Acquisition = { client_id: number; employee_id: number | null; week_date: string | null }

// ─── Утилиты ─────────────────────────────────────────────────────────────────

const toYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function getWeekMonday(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const day = x.getDay()
  x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day))
  return x
}

const fmtDate = (s: string) => {
  const [, m, d] = s.split('-').map(Number)
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}`
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n)) + ' ₽'

function clientManager(c: Client): Employee | null {
  if (!c.employees) return null
  return Array.isArray(c.employees) ? (c.employees[0] ?? null) : c.employees
}

// Статусы
const PERF_LABEL: Record<Performance, string> = { growth: 'Рост', plateau: 'Плато', decline: 'Спад' }
const PERF_SHORT: Record<Performance, string>  = { growth: 'Р',    plateau: 'П',     decline: 'С' }
const PERF_CLS: Record<Performance, string> = {
  growth:  'bg-green-100 dark:bg-green-950/60 text-green-700 dark:text-green-400 hover:bg-green-200',
  plateau: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 hover:bg-amber-200',
  decline: 'bg-red-100   dark:bg-red-950/60   text-red-700   dark:text-red-400   hover:bg-red-200',
}
const PERF_CYCLE: Array<Performance | null> = ['growth', 'plateau', 'decline', null]

const RATE_SERVICE_FIELDS: Array<[keyof Rates, string]> = [
  ['setup',   'Стартовая настройка'],
  ['growth',  'Сопровождение — рост'],
  ['plateau', 'Сопровождение — плато'],
  ['decline', 'Сопровождение — спад'],
]
const RATE_ACQ_FIELDS: Array<[keyof Rates, string]> = [
  ['lead',    'Привлечение лида'],
  ['signing', 'Подписание клиента'],
]

// ─── Компонент ───────────────────────────────────────────────────────────────

export default function CostsPage() {
  const supabase = createClient()

  const [clients,      setClients]      = useState<Client[]>([])
  const [employees,    setEmployees]    = useState<Employee[]>([])
  const [rates,        setRates]        = useState<Rates>({ setup: 0, growth: 0, plateau: 0, decline: 0, lead: 0, signing: 0 })
  const [ratesDraft,   setRatesDraft]   = useState<Rates>({ setup: 0, growth: 0, plateau: 0, decline: 0, lead: 0, signing: 0 })
  const [performances, setPerformances] = useState<Map<string, Performance>>(new Map())
  const [setups,       setSetups]       = useState<Map<number, string>>(new Map())       // clientId → week_date
  const [acquisitions, setAcquisitions] = useState<Map<number, Acquisition>>(new Map())  // clientId → acq
  const [loading,      setLoading]      = useState(true)
  const [ratesSaving,  setRatesSaving]  = useState(false)

  // ── Диапазон недель для блока 2 ──────────────────────────────────────────
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const currentMonday    = getWeekMonday(today)
  const currentMondayStr = toYMD(currentMonday)

  const initFrom = new Date(currentMonday); initFrom.setDate(initFrom.getDate() - 4 * 7)
  const initTo   = new Date(currentMonday); initTo.setDate(initTo.getDate() + 8 * 7)
  const [weekFrom, setWeekFrom] = useState(toYMD(initFrom))
  const [weekTo,   setWeekTo]   = useState(toYMD(initTo))

  // ── Диапазон для блока 3 ─────────────────────────────────────────────────
  const [calcFrom, setCalcFrom] = useState(toYMD(initFrom))
  const [calcTo,   setCalcTo]   = useState(toYMD(currentMonday))

  // Недели для матрицы
  const weeks: string[] = []
  const wc = new Date(weekFrom + 'T00:00:00')
  while (toYMD(wc) <= weekTo) {
    weeks.push(toYMD(wc))
    wc.setDate(wc.getDate() + 7)
  }

  const scrollRef = useRef<HTMLDivElement>(null)

  // ── Загрузка ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [cliRes, empRes, ratesRes, perfRes, setupRes, acqRes] = await Promise.all([
        supabase.from('clients').select('id, name, manager_id, employees(id, name)').order('name'),
        supabase.from('employees').select('id, name').order('name'),
        supabase.from('cost_rates').select('*'),
        supabase.from('client_weekly_performance').select('*'),
        supabase.from('client_setups').select('*'),
        supabase.from('client_acquisitions').select('*'),
      ])

      if (cliRes.data)   setClients(cliRes.data as Client[])
      if (empRes.data)   setEmployees(empRes.data)

      if (ratesRes.data) {
        const r: Rates = { setup: 0, growth: 0, plateau: 0, decline: 0, lead: 0, signing: 0 }
        ratesRes.data.forEach((row: any) => { if (row.rate_type in r) r[row.rate_type as keyof Rates] = Number(row.amount) })
        setRates(r); setRatesDraft({ ...r })
      }

      if (perfRes.data) {
        const m = new Map<string, Performance>()
        perfRes.data.forEach((row: any) => m.set(`${row.client_id}_${row.week_date}`, row.performance))
        setPerformances(m)
      }

      if (setupRes.data) {
        const m = new Map<number, string>()
        setupRes.data.forEach((row: any) => m.set(row.client_id, row.week_date))
        setSetups(m)
      }

      if (acqRes.data) {
        const m = new Map<number, Acquisition>()
        acqRes.data.forEach((row: any) => m.set(row.client_id, row))
        setAcquisitions(m)
      }

      setLoading(false)
    }
    load()
  }, [])

  // Auto-scroll к текущей неделе
  useEffect(() => {
    if (!scrollRef.current) return
    const idx = weeks.indexOf(currentMondayStr)
    if (idx < 0) return
    const stickyW = 160 + 110 + 100 // client + manager + setup cols ≈ 370px
    const colW = 44
    const container = scrollRef.current
    container.scrollLeft = Math.max(0, stickyW + idx * colW - (container.clientWidth - stickyW) / 2)
  }, [weekFrom, weekTo])

  // ── Тарифы ───────────────────────────────────────────────────────────────
  const saveRates = async () => {
    setRatesSaving(true)
    const rows = Object.entries(ratesDraft).map(([rate_type, amount]) => ({ rate_type, amount }))
    await supabase.from('cost_rates').upsert(rows, { onConflict: 'rate_type' })
    setRates({ ...ratesDraft })
    setRatesSaving(false)
  }

  // ── Перформанс ───────────────────────────────────────────────────────────
  const togglePerf = async (clientId: number, week: string) => {
    const key = `${clientId}_${week}`
    const curr = performances.get(key) ?? null
    const idx  = PERF_CYCLE.indexOf(curr)
    const next = PERF_CYCLE[(idx + 1) % PERF_CYCLE.length]
    const newMap = new Map(performances)
    if (next === null) {
      newMap.delete(key)
      await supabase.from('client_weekly_performance').delete().eq('client_id', clientId).eq('week_date', week)
    } else {
      newMap.set(key, next)
      await supabase.from('client_weekly_performance')
        .upsert({ client_id: clientId, week_date: week, performance: next }, { onConflict: 'client_id,week_date' })
    }
    setPerformances(newMap)
  }

  // ── Настройка ────────────────────────────────────────────────────────────
  const saveSetup = async (clientId: number, weekDate: string | null) => {
    const newMap = new Map(setups)
    if (!weekDate) {
      newMap.delete(clientId)
      await supabase.from('client_setups').delete().eq('client_id', clientId)
    } else {
      newMap.set(clientId, weekDate)
      await supabase.from('client_setups').upsert({ client_id: clientId, week_date: weekDate }, { onConflict: 'client_id' })
    }
    setSetups(newMap)
  }

  // ── Привлечение ──────────────────────────────────────────────────────────
  const saveAcquisition = async (clientId: number, employeeId: number | null, weekDate: string | null) => {
    const newMap = new Map(acquisitions)
    if (!employeeId && !weekDate) {
      newMap.delete(clientId)
      await supabase.from('client_acquisitions').delete().eq('client_id', clientId)
    } else {
      const row: Acquisition = { client_id: clientId, employee_id: employeeId, week_date: weekDate }
      newMap.set(clientId, row)
      await supabase.from('client_acquisitions').upsert(row, { onConflict: 'client_id' })
    }
    setAcquisitions(newMap)
  }

  // ── Расчёт блок 3 ────────────────────────────────────────────────────────
  type MgrRow = { name: string; setups: number; growth: number; plateau: number; decline: number }
  const byManager = new Map<number | null, MgrRow>()

  clients.forEach(c => {
    const mgr   = clientManager(c)
    const mgrId = mgr?.id ?? null
    const mgrName = mgr?.name ?? 'Без менеджера'
    if (!byManager.has(mgrId)) byManager.set(mgrId, { name: mgrName, setups: 0, growth: 0, plateau: 0, decline: 0 })
    const row = byManager.get(mgrId)!

    // Setup
    const sw = setups.get(c.id)
    if (sw && sw >= calcFrom && sw <= calcTo) row.setups++

    // Performance
    performances.forEach((perf, key) => {
      const [cidStr, wk] = key.split('_')
      if (Number(cidStr) !== c.id) return
      if (wk < calcFrom || wk > calcTo) return
      row[perf]++
    })
  })

  // Acquisition costs in period
  type AcqEntry = { clientName: string; week: string | null }
  const byAcqEmployee = new Map<number | null, { name: string; items: AcqEntry[] }>()

  acquisitions.forEach((acq, clientId) => {
    const wk = acq.week_date
    if (wk && (wk < calcFrom || wk > calcTo)) return
    const c   = clients.find(x => x.id === clientId)
    if (!c) return
    const emp = employees.find(e => e.id === acq.employee_id)
    const empId   = acq.employee_id ?? null
    const empName = emp?.name ?? 'Без сотрудника'
    if (!byAcqEmployee.has(empId)) byAcqEmployee.set(empId, { name: empName, items: [] })
    byAcqEmployee.get(empId)!.items.push({ clientName: c.name, week: wk ?? null })
  })

  // ─────────────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen bg-[var(--background)]">
      <Nav />
      <div className="mx-auto max-w-7xl px-4 py-8">
        <p className="text-[var(--muted)]">Загрузка…</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Nav />
      <main className="mx-auto max-w-[84rem] px-4 py-8 sm:px-6 space-y-8">
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Затраты</h1>

        {/* ── Блок 1: Тарифы ───────────────────────────────────────────────── */}
        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
          <h2 className="mb-5 text-lg font-medium text-[var(--foreground)]">Тарифы</h2>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">

            {/* Проекты */}
            <div>
              <p className="mb-3 text-sm font-medium text-[var(--muted)]">По проектам</p>
              <div className="space-y-2.5">
                {RATE_SERVICE_FIELDS.map(([key, label]) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="w-52 text-sm text-[var(--foreground)]">{label}</span>
                    <input
                      type="number" min="0"
                      value={ratesDraft[key]}
                      onChange={e => setRatesDraft(d => ({ ...d, [key]: Number(e.target.value) }))}
                      className="w-32 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 text-[var(--foreground)]"
                    />
                    <span className="text-sm text-[var(--muted)]">₽</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Привлечение */}
            <div>
              <p className="mb-3 text-sm font-medium text-[var(--muted)]">По привлечению</p>
              <div className="space-y-2.5">
                {RATE_ACQ_FIELDS.map(([key, label]) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="w-52 text-sm text-[var(--foreground)]">{label}</span>
                    <input
                      type="number" min="0"
                      value={ratesDraft[key]}
                      onChange={e => setRatesDraft(d => ({ ...d, [key]: Number(e.target.value) }))}
                      className="w-32 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 text-[var(--foreground)]"
                    />
                    <span className="text-sm text-[var(--muted)]">₽</span>
                  </div>
                ))}
              </div>
              <button
                onClick={saveRates}
                disabled={ratesSaving}
                className="mt-6 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
              >
                {ratesSaving ? 'Сохранение…' : 'Сохранить тарифы'}
              </button>
            </div>
          </div>
        </section>

        {/* ── Блок 2: Результаты по клиентам ───────────────────────────────── */}
        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-lg font-medium text-[var(--foreground)]">Результаты по клиентам</h2>
            <div className="flex items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                <span className="text-[var(--muted)]">с</span>
                <input type="date" value={weekFrom} onChange={e => setWeekFrom(e.target.value)}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800" />
              </label>
              <label className="flex items-center gap-2">
                <span className="text-[var(--muted)]">по</span>
                <input type="date" value={weekTo} onChange={e => setWeekTo(e.target.value)}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800" />
              </label>
            </div>
          </div>

          <div ref={scrollRef} className="overflow-x-auto">
            <table className="text-xs border-collapse" style={{ minWidth: 'max-content' }}>
              <thead>
                <tr>
                  <th className="text-left pl-3 pr-2 py-2 font-medium text-[var(--muted)] sticky left-0 bg-[var(--card)] z-10 min-w-[160px]">Клиент</th>
                  <th className="text-left px-2 py-2 font-medium text-[var(--muted)] min-w-[110px]">Менеджер</th>
                  <th className="text-center px-2 py-2 font-medium text-[var(--muted)] min-w-[100px]">Настройка</th>
                  {weeks.map(wk => (
                    <th key={wk} className={`text-center px-0.5 py-2 font-medium w-11 min-w-[44px] ${wk === currentMondayStr ? 'text-blue-600 dark:text-blue-400' : 'text-[var(--muted)]'}`}>
                      {fmtDate(wk)}
                      {wk === currentMondayStr && <div className="w-full h-0.5 bg-blue-500 rounded mt-0.5" />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clients.map(c => {
                  const mgr      = clientManager(c)
                  const setupWk  = setups.get(c.id) ?? ''
                  return (
                    <tr key={c.id} className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="pl-3 pr-2 py-1.5 font-medium text-[var(--foreground)] sticky left-0 bg-[var(--card)] z-10 max-w-[180px] truncate" title={c.name}>
                        {c.name}
                      </td>
                      <td className="px-2 py-1.5 text-[var(--muted)] max-w-[120px] truncate">
                        {mgr?.name ?? '—'}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <input
                          type="date"
                          value={setupWk}
                          onChange={e => saveSetup(c.id, e.target.value || null)}
                          className="w-28 rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] dark:border-zinc-600 dark:bg-zinc-800 text-[var(--foreground)]"
                          title="Неделя стартовой настройки"
                        />
                      </td>
                      {weeks.map(wk => {
                        const perf = performances.get(`${c.id}_${wk}`)
                        return (
                          <td key={wk} className="text-center px-0.5 py-1">
                            <button
                              onClick={() => togglePerf(c.id, wk)}
                              className={`inline-flex items-center justify-center w-9 h-7 rounded text-[10px] font-semibold transition-colors ${
                                perf ? PERF_CLS[perf] : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                              }`}
                              title={perf ? PERF_LABEL[perf] : 'Нажмите: Р → П → С'}
                            >
                              {perf ? PERF_SHORT[perf] : '·'}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap gap-4 text-xs text-[var(--muted)]">
            <span className="flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center w-6 h-5 rounded text-[10px] font-semibold bg-green-100 dark:bg-green-950/60 text-green-700 dark:text-green-400">Р</span>Рост
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center w-6 h-5 rounded text-[10px] font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400">П</span>Плато
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center w-6 h-5 rounded text-[10px] font-semibold bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400">С</span>Спад
            </span>
            <span className="text-zinc-400">Нажмите ячейку для переключения. Настройка — неделя первичной настройки клиента.</span>
          </div>
        </section>

        {/* ── Блок 3: Расчёт затрат ─────────────────────────────────────────── */}
        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-lg font-medium text-[var(--foreground)]">Расчёт затрат</h2>
            <div className="flex items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                <span className="text-[var(--muted)]">с</span>
                <input type="date" value={calcFrom} onChange={e => setCalcFrom(e.target.value)}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800" />
              </label>
              <label className="flex items-center gap-2">
                <span className="text-[var(--muted)]">по</span>
                <input type="date" value={calcTo} onChange={e => setCalcTo(e.target.value)}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800" />
              </label>
            </div>
          </div>

          {/* Оказание услуг */}
          <h3 className="mb-3 text-sm font-semibold text-[var(--foreground)] uppercase tracking-wide">Оказание услуг</h3>
          <div className="overflow-auto rounded-lg border border-[var(--border)] mb-8">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--muted)]/10">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-[var(--muted)]">Менеджер</th>
                  <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Настройки</th>
                  <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Рост</th>
                  <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Плато</th>
                  <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Спад</th>
                  <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Итого, ₽</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {byManager.size === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-4 text-center text-[var(--muted)]">Нет данных за выбранный период</td></tr>
                ) : (
                  Array.from(byManager.values()).map(row => {
                    const total = row.setups * rates.setup + row.growth * rates.growth + row.plateau * rates.plateau + row.decline * rates.decline
                    const fmt = (n: number, rate: number) => n > 0 ? `${n} × ${fmtMoney(rate)}` : '—'
                    return (
                      <tr key={row.name} className="hover:bg-[var(--muted)]/5">
                        <td className="px-3 py-2 font-medium text-[var(--foreground)]">{row.name}</td>
                        <td className="px-3 py-2 text-right text-[var(--muted)]">{fmt(row.setups, rates.setup)}</td>
                        <td className="px-3 py-2 text-right text-[var(--muted)]">{fmt(row.growth, rates.growth)}</td>
                        <td className="px-3 py-2 text-right text-[var(--muted)]">{fmt(row.plateau, rates.plateau)}</td>
                        <td className="px-3 py-2 text-right text-[var(--muted)]">{fmt(row.decline, rates.decline)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-[var(--foreground)]">{fmtMoney(total)}</td>
                      </tr>
                    )
                  })
                )}
                {byManager.size > 1 && (() => {
                  const s = Array.from(byManager.values()).reduce(
                    (a, r) => ({ s: a.s + r.setups * rates.setup, g: a.g + r.growth * rates.growth, p: a.p + r.plateau * rates.plateau, d: a.d + r.decline * rates.decline }),
                    { s: 0, g: 0, p: 0, d: 0 }
                  )
                  return (
                    <tr className="border-t-2 border-[var(--border)] bg-[var(--muted)]/5 font-bold">
                      <td className="px-3 py-2">Итого</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(s.s)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(s.g)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(s.p)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(s.d)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(s.s + s.g + s.p + s.d)}</td>
                    </tr>
                  )
                })()}
              </tbody>
            </table>
          </div>

          {/* Привлечение клиентов */}
          <h3 className="mb-3 text-sm font-semibold text-[var(--foreground)] uppercase tracking-wide">Привлечение клиентов</h3>
          <div className="overflow-auto rounded-lg border border-[var(--border)]">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--muted)]/10">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-[var(--muted)]">Клиент</th>
                  <th className="px-3 py-2 text-left font-medium text-[var(--muted)]">Сотрудник</th>
                  <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Неделя</th>
                  <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Лид</th>
                  <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Подписание</th>
                  <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Итого, ₽</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {byAcqEmployee.size === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-4 text-center text-[var(--muted)]">Нет данных за выбранный период</td></tr>
                ) : Array.from(byAcqEmployee.entries()).flatMap(([empId, { name: empName, items }]) => [
                    ...items.map((item, i) => (
                      <tr key={`${empId}_${i}`} className="hover:bg-[var(--muted)]/5">
                        <td className="px-3 py-2 text-[var(--foreground)]">{item.clientName}</td>
                        <td className="px-3 py-2 text-[var(--muted)]">{empName}</td>
                        <td className="px-3 py-2 text-right text-[var(--muted)]">{item.week ? fmtDate(item.week) : '—'}</td>
                        <td className="px-3 py-2 text-right text-[var(--muted)]">{fmtMoney(rates.lead)}</td>
                        <td className="px-3 py-2 text-right text-[var(--muted)]">{fmtMoney(rates.signing)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-[var(--foreground)]">{fmtMoney(rates.lead + rates.signing)}</td>
                      </tr>
                    )),
                    <tr key={`${empId}_sub`} className="bg-[var(--muted)]/5 font-medium border-t border-[var(--border)]">
                      <td className="px-3 py-1.5 text-[var(--muted)] pl-6" colSpan={5}>{empName} — итого</td>
                      <td className="px-3 py-1.5 text-right text-[var(--foreground)]">{fmtMoney(items.length * (rates.lead + rates.signing))}</td>
                    </tr>,
                  ])
                }
              </tbody>
            </table>
          </div>

          {/* Привязка привлечения */}
          <details className="mt-6">
            <summary className="cursor-pointer select-none text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 list-none flex items-center gap-1">
              <span>Привязка привлечения клиентов</span>
              <span className="text-xs opacity-60">▼</span>
            </summary>
            <div className="mt-3 overflow-auto rounded-lg border border-[var(--border)]">
              <table className="min-w-full text-sm">
                <thead className="bg-[var(--muted)]/10">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-[var(--muted)]">Клиент</th>
                    <th className="px-3 py-2 text-left font-medium text-[var(--muted)]">Кто привлёк</th>
                    <th className="px-3 py-2 text-left font-medium text-[var(--muted)]">Неделя</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {clients.map(c => {
                    const acq = acquisitions.get(c.id)
                    return (
                      <tr key={c.id} className="hover:bg-[var(--muted)]/5">
                        <td className="px-3 py-2 font-medium text-[var(--foreground)]">{c.name}</td>
                        <td className="px-3 py-2">
                          <select
                            value={acq?.employee_id ?? ''}
                            onChange={e => saveAcquisition(c.id, e.target.value ? Number(e.target.value) : null, acq?.week_date ?? null)}
                            className="rounded border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800 text-[var(--foreground)]"
                          >
                            <option value="">— не указан —</option>
                            {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="date"
                            value={acq?.week_date ?? ''}
                            onChange={e => saveAcquisition(c.id, acq?.employee_id ?? null, e.target.value || null)}
                            className="rounded border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800 text-[var(--foreground)]"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      </main>
    </div>
  )
}
