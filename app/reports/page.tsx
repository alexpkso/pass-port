'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import Nav from '../components/Nav'
import Breadcrumbs from '../components/Breadcrumbs'

type JournalEntry = {
  id: number
  entry_date: string
  debit_account_code: string
  credit_account_code: string
  amount: number
  client_id: number
  service_name: string
  document_type: string
  document_id: number
  document_extra: string
  created_at: string
}

type Client = { id: number; name: string }

type Charge = {
  id: number
  client_id: number
  service_name: string
  start_date: string | null
  end_date: string | null
  amount: number
  created_at: string
}

type Payment = {
  id: number
  client_id: number
  service_name: string
  amount: number
  payment_date?: string
  created_at: string
}

const formatMoney = (n: number) =>
  new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n) + ' ₽'

function getWeekMonday(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const day = x.getDay()
  const monOffset = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + monOffset)
  return x
}

export default function ReportsPage() {
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([])
  const [charges, setCharges] = useState<Charge[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [periodFrom, setPeriodFrom] = useState('')
  const [periodTo, setPeriodTo] = useState('')

  useEffect(() => {
    const d = new Date()
    setPeriodFrom(`${d.getFullYear()}-01-01`)
    setPeriodTo(d.toISOString().slice(0, 10))
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const supabase = createClient()
    Promise.all([
      supabase.from('journal_entries').select('id, entry_date, debit_account_code, credit_account_code, amount, client_id, service_name, document_type, document_id, document_extra, created_at').order('entry_date', { ascending: true }),
      supabase.from('charges').select('id, client_id, service_name, start_date, end_date, amount, created_at'),
      supabase.from('payments').select('id, client_id, service_name, amount, payment_date, created_at'),
      supabase.from('clients').select('id, name').order('name'),
    ]).then(([entriesRes, chargesRes, paymentsRes, clientsRes]) => {
      if (cancelled) return
      setJournalEntries((entriesRes.data ?? []) as JournalEntry[])
      setCharges((chargesRes.data ?? []) as Charge[])
      setPayments((paymentsRes.data ?? []) as Payment[])
      setClients((clientsRes.data ?? []) as Client[])
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const entries62 = journalEntries.filter((e) => e.debit_account_code === '62' || e.credit_account_code === '62')
  const clientIds = Array.from(new Set(entries62.map((e) => e.client_id))).sort((a, b) => a - b)
  const clientByName = Object.fromEntries(clients.map((c) => [c.id, c.name]))
  const periodFromDate = periodFrom || '1970-01-01'
  const periodToDate = periodTo || '2099-12-31'

  const cardRows = clientIds.map((client_id) => {
    const forClient = (ee: typeof entries62) => ee.filter((e) => e.client_id === client_id)
    const beforePeriod = forClient(entries62).filter((e) => e.entry_date < periodFromDate)
    const inPeriod = forClient(entries62).filter((e) => e.entry_date >= periodFromDate && e.entry_date <= periodToDate)
    const opening = beforePeriod.reduce((s, e) => s + (e.debit_account_code === '62' ? Number(e.amount) : -Number(e.amount)), 0)
    const charged = inPeriod.filter((e) => e.debit_account_code === '62').reduce((s, e) => s + Number(e.amount), 0)
    const paid = inPeriod.filter((e) => e.credit_account_code === '62').reduce((s, e) => s + Number(e.amount), 0)
    const closing = opening + charged - paid
    return { client_id, client_name: clientByName[client_id] ?? `Клиент #${client_id}`, opening, charged, paid, closing }
  })

  const cardTotal = cardRows.reduce(
    (acc, r) => ({ opening: acc.opening + r.opening, charged: acc.charged + r.charged, paid: acc.paid + r.paid, closing: acc.closing + r.closing }),
    { opening: 0, charged: 0, paid: 0, closing: 0 }
  )

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const currentWeekMonday = getWeekMonday(today)
  const clientIdsWithCharges = Array.from(new Set(charges.map((c) => c.client_id)))
  type ServiceRow = { client_id: number; client_name: string; totalCharged: number; totalPaid: number; toPay: number; sumRendered: number; debtClient: number | null; debtUs: number | null; debtWeeks: number }
  const serviceRows: ServiceRow[] = clientIdsWithCharges.map((client_id) => {
    const clientCharges = charges.filter((c) => c.client_id === client_id)
    const clientPayments = payments.filter((p) => p.client_id === client_id)
    const totalCharged = clientCharges.reduce((s, c) => s + Number(c.amount), 0)
    const totalPaid = clientPayments.reduce((s, p) => s + Number(p.amount), 0)
    const toPay = totalCharged - totalPaid
    let sumRendered = 0
    let totalWeeksContract = 0
    let weeksRenderedCount = 0
    clientCharges.forEach((c) => {
      const startStr = c.start_date || c.created_at
      const endStr = c.end_date || c.start_date || c.created_at
      if (!startStr) return
      const start = new Date(startStr)
      const end = endStr ? new Date(endStr) : new Date(start)
      start.setHours(0, 0, 0, 0)
      end.setHours(0, 0, 0, 0)
      const mondayEnd = getWeekMonday(end)
      const mondayOfStartWeek = getWeekMonday(start)
      const firstWeekMonday = new Date(mondayOfStartWeek)
      firstWeekMonday.setDate(firstWeekMonday.getDate() + 7)
      if (firstWeekMonday.getTime() > mondayEnd.getTime()) {
        totalWeeksContract += 1
        if (mondayEnd.getTime() <= currentWeekMonday.getTime()) { sumRendered += Number(c.amount); weeksRenderedCount += 1 }
        return
      }
      const cursor = new Date(firstWeekMonday)
      let numWeeks = 0
      while (cursor.getTime() <= mondayEnd.getTime()) { numWeeks += 1; cursor.setDate(cursor.getDate() + 7) }
      const amountPerWeek = Number(c.amount) / numWeeks
      totalWeeksContract += numWeeks
      cursor.setTime(firstWeekMonday.getTime())
      while (cursor.getTime() <= mondayEnd.getTime()) {
        if (cursor.getTime() <= currentWeekMonday.getTime()) { sumRendered += amountPerWeek; weeksRenderedCount += 1 }
        cursor.setDate(cursor.getDate() + 7)
      }
    })
    let debtClient: number | null = null
    let debtUs: number | null = null
    let debtWeeks = 0
    if (totalWeeksContract > 0) {
      const amountPerWeek = totalCharged / totalWeeksContract
      const weeksPaid = totalPaid / amountPerWeek
      if (weeksRenderedCount > weeksPaid) { debtWeeks = Math.round(weeksRenderedCount - weeksPaid); debtClient = debtWeeks * amountPerWeek }
      else if (weeksPaid > weeksRenderedCount) { debtWeeks = Math.round(weeksPaid - weeksRenderedCount); debtUs = debtWeeks * amountPerWeek }
    }
    return { client_id, client_name: clientByName[client_id] ?? `Клиент #${client_id}`, totalCharged, totalPaid, toPay, sumRendered, debtClient, debtUs, debtWeeks }
  })

  const clientsWeOwe = serviceRows.filter((r) => r.debtUs != null && r.debtUs > 0)
  const clientsWhoOweUs = serviceRows.filter((r) => r.debtClient != null && r.debtClient > 0)
  const totalWeOwe = clientsWeOwe.reduce((acc, r) => ({ totalCharged: acc.totalCharged + r.totalCharged, totalPaid: acc.totalPaid + r.totalPaid, toPay: acc.toPay + r.toPay, sumRendered: acc.sumRendered + r.sumRendered, debtUs: acc.debtUs + (r.debtUs ?? 0) }), { totalCharged: 0, totalPaid: 0, toPay: 0, sumRendered: 0, debtUs: 0 })
  const totalWhoOweUs = clientsWhoOweUs.reduce((acc, r) => ({ totalCharged: acc.totalCharged + r.totalCharged, totalPaid: acc.totalPaid + r.totalPaid, toPay: acc.toPay + r.toPay, sumRendered: acc.sumRendered + r.sumRendered, debtClient: acc.debtClient + (r.debtClient ?? 0) }), { totalCharged: 0, totalPaid: 0, toPay: 0, sumRendered: 0, debtClient: 0 })

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Nav />
      <div className="mx-auto max-w-[84rem] px-4 py-8 sm:px-6">
        <Breadcrumbs items={[{ href: '/', label: 'Главная' }, { href: '/reports', label: 'Отчёты' }]} />
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Отчёты</h1>

        <section className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
          <h2 className="text-lg font-medium text-[var(--foreground)]">Карточка счёта 62</h2>
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <label className="flex items-center gap-2">
              <span className="text-sm text-[var(--muted)]">Период с</span>
              <input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800" />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-sm text-[var(--muted)]">по</span>
              <input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800" />
            </label>
          </div>
          {loading ? <p className="mt-4 text-sm text-[var(--muted)]">Загрузка…</p> : (
            <>
              <div className="mt-4 overflow-auto rounded-lg border border-[var(--border)]">
                <table className="min-w-full text-sm">
                  <thead className="bg-[var(--muted)]/10">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-[var(--muted)]">Клиент</th>
                      <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Сальдо на начало</th>
                      <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Начислено</th>
                      <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Оплачено</th>
                      <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Сальдо на конец</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {cardRows.map((r) => (
                      <tr key={r.client_id}>
                        <td className="px-3 py-2">{r.client_name}</td>
                        <td className="px-3 py-2 text-right">{formatMoney(r.opening)}</td>
                        <td className="px-3 py-2 text-right">{formatMoney(r.charged)}</td>
                        <td className="px-3 py-2 text-right">{formatMoney(r.paid)}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatMoney(r.closing)}</td>
                      </tr>
                    ))}
                    {cardRows.length > 0 && (
                      <tr className="border-t-2 border-[var(--border)] bg-[var(--muted)]/5 font-medium">
                        <td className="px-3 py-2">Итого</td>
                        <td className="px-3 py-2 text-right">{formatMoney(cardTotal.opening)}</td>
                        <td className="px-3 py-2 text-right">{formatMoney(cardTotal.charged)}</td>
                        <td className="px-3 py-2 text-right">{formatMoney(cardTotal.paid)}</td>
                        <td className="px-3 py-2 text-right">{formatMoney(cardTotal.closing)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {cardRows.length === 0 && <p className="mt-2 text-sm text-[var(--muted)]">Нет проводок по счёту 62 за выбранный период и ранее.</p>}
              <p className="mt-3 text-xs text-[var(--muted)]">Положительное сальдо означает задолженность клиента, отрицательное — переплату.</p>
            </>
          )}
        </section>

        <section className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
          <h2 className="text-lg font-medium text-[var(--foreground)]">Карточка оказания услуг</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">По каждому клиенту суммированы все услуги.</p>
          {loading ? <p className="mt-4 text-sm text-[var(--muted)]">Загрузка…</p> : (
            <div className="mt-4 space-y-8">
              <div>
                <h3 className="mb-2 text-sm font-medium text-[var(--foreground)]">Кому мы должны оказание услуг</h3>
                <div className="overflow-auto rounded-lg border border-[var(--border)]">
                  <table className="min-w-full table-fixed text-sm">
                    <colgroup>
                      <col style={{ width: '320px' }} />
                      <col className="w-[120px]" /><col className="w-[120px]" /><col className="w-[110px]" /><col className="w-[130px]" /><col className="w-[120px]" />
                    </colgroup>
                    <thead className="bg-[var(--muted)]/10">
                      <tr>
                        <th className="w-[320px] max-w-[320px] px-3 py-2 text-left font-medium text-[var(--muted)]">Клиент</th>
                        <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Сумма по контрактам<br />за все время</th>
                        <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Сумма оплат<br />за все время</th>
                        <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Сумма к оплате</th>
                        <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Сумма оказанных услуг</th>
                        <th className="px-3 py-2 text-left font-medium text-[var(--muted)]">Наша задолженность</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {clientsWeOwe.map((r) => (
                        <tr key={r.client_id}>
                          <td className="w-[320px] max-w-[320px] overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2 font-medium" title={r.client_name}>{r.client_name}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(Math.round(r.totalCharged))}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(Math.round(r.totalPaid))}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(Math.round(r.toPay))}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(Math.round(r.sumRendered))}</td>
                          <td className="px-3 py-2 text-green-600 dark:text-green-400 tabular-nums">{formatMoney(Math.round(r.debtUs ?? 0))} ({r.debtWeeks} нед.)</td>
                        </tr>
                      ))}
                      {clientsWeOwe.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-[var(--muted)]">Нет клиентов с нашей задолженностью по оказанию услуг.</td></tr>}
                      {clientsWeOwe.length > 0 && (
                        <tr className="border-t-2 border-[var(--border)] bg-[var(--muted)]/5 font-medium">
                          <td className="w-[320px] max-w-[320px] px-3 py-2">Итого</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(Math.round(totalWeOwe.totalCharged))}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(Math.round(totalWeOwe.totalPaid))}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(Math.round(totalWeOwe.toPay))}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(Math.round(totalWeOwe.sumRendered))}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-green-600 dark:text-green-400">{formatMoney(Math.round(totalWeOwe.debtUs))}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-medium text-[var(--foreground)]">Кто нам должен за оказанные услуги</h3>
                <div className="overflow-auto rounded-lg border border-[var(--border)]">
                  <table className="min-w-full table-fixed text-sm">
                    <colgroup>
                      <col style={{ width: '320px' }} />
                      <col className="w-[120px]" /><col className="w-[120px]" /><col className="w-[110px]" /><col className="w-[130px]" /><col className="w-[120px]" />
                    </colgroup>
                    <thead className="bg-[var(--muted)]/10">
                      <tr>
                        <th className="w-[320px] max-w-[320px] px-3 py-2 text-left font-medium text-[var(--muted)]">Клиент</th>
                        <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Сумма по контрактам<br />за все время</th>
                        <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Сумма оплат<br />за все время</th>
                        <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Сумма к оплате</th>
                        <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Сумма оказанных услуг</th>
                        <th className="px-3 py-2 text-left font-medium text-[var(--muted)]">Задолженность клиента</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {clientsWhoOweUs.map((r) => (
                        <tr key={r.client_id}>
                          <td className="w-[320px] max-w-[320px] overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2 font-medium" title={r.client_name}>{r.client_name}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(Math.round(r.totalCharged))}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(Math.round(r.totalPaid))}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(Math.round(r.toPay))}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(Math.round(r.sumRendered))}</td>
                          <td className="px-3 py-2 text-red-600 dark:text-red-400 tabular-nums">{formatMoney(Math.round(r.debtClient ?? 0))} ({r.debtWeeks} нед.)</td>
                        </tr>
                      ))}
                      {clientsWhoOweUs.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-[var(--muted)]">Нет клиентов с задолженностью за оказанные услуги.</td></tr>}
                      {clientsWhoOweUs.length > 0 && (
                        <tr className="border-t-2 border-[var(--border)] bg-[var(--muted)]/5 font-medium">
                          <td className="w-[320px] max-w-[320px] px-3 py-2">Итого</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(Math.round(totalWhoOweUs.totalCharged))}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(Math.round(totalWhoOweUs.totalPaid))}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(Math.round(totalWhoOweUs.toPay))}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(Math.round(totalWhoOweUs.sumRendered))}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-red-600 dark:text-red-400">{formatMoney(Math.round(totalWhoOweUs.debtClient))}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="text-xs text-[var(--muted)]">Наша задолженность — это, сколько недель оказания услуг мы ещё должны клиенту.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
