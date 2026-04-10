import Link from 'next/link'
import Breadcrumbs from '../components/Breadcrumbs'
import DashboardChurnCharts from '../components/DashboardChurnCharts'
import DashboardSubscriptionMetrics from '../components/DashboardSubscriptionMetrics'
import DashboardWeeklyClients from '../components/DashboardWeeklyClients'

const primaryNav = [
  { href: '/', label: 'Дашборд' },
  { href: '/clients', label: 'Клиенты' },
  { href: '/employees', label: 'Сотрудники' },
  { href: '/services', label: 'Услуги' },
  { href: '/reports', label: 'Отчеты' },
]

const secondaryNav = [
  { href: '/costs', label: 'Затраты' },
  { href: '/activity', label: 'Журнал действий' },
  { href: '/about', label: 'О сервисе' },
]

const topCards = [
  { title: 'Выручка (месяц)', value: '4 250 000 ₽', note: '+12.5% к прошлому месяцу' },
  { title: 'Заказы в работе', value: '142', note: '24 требуют внимания' },
  { title: 'Новые клиенты', value: '18', note: '+4 за эту неделю' },
  { title: 'Задолженность', value: '320 000 ₽', note: '5 клиентов с просрочкой' },
]

function Sidebar() {
  return (
    <aside className="w-full border-b border-[var(--border)] bg-[var(--card)] p-4 lg:w-64 lg:flex-none lg:border-b-0 lg:border-r lg:p-5">
      <div className="flex h-full flex-col gap-5">
        <div className="px-1">
          <Link href="/" className="text-base font-semibold tracking-tight text-[var(--foreground)]">
            NovoPrint
          </Link>
        </div>

        <nav aria-label="Главная навигация" className="space-y-1">
          {primaryNav.map((item, idx) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                idx === 0
                  ? 'bg-[var(--accent)] text-[var(--accent-foreground)]'
                  : 'text-[var(--foreground)] hover:bg-[var(--border)]/50'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="space-y-2">
          <p className="px-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Прочее</p>
          <nav aria-label="Дополнительная навигация" className="space-y-1">
            {secondaryNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center rounded-md px-3 py-2 text-sm text-[var(--foreground)] transition-colors hover:bg-[var(--border)]/50"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="lg:mt-auto">
          <button
            type="button"
            className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-left text-sm font-medium text-[var(--foreground)]"
          >
            Аккаунт
          </button>
        </div>
      </div>
    </aside>
  )
}

export default function HomeUiPreviewPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto flex min-h-screen w-full max-w-[96rem] flex-col lg:flex-row">
        <Sidebar />

        <main className="flex-1">
          <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
            <Breadcrumbs items={[{ href: '/', label: 'Главная' }, { href: '/home-ui-preview', label: 'UI-превью' }]} />

            <section className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-[var(--muted)]">Главная · Операционный обзор</p>
                  <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Ключевые показатели</h1>
                  <p className="mt-2 max-w-3xl text-sm text-[var(--muted)] sm:text-base">
                    Тестовая страница с новым визуальным стилем. Структура данных и существующие блоки сохранены.
                  </p>
                </div>
                <div className="rounded-full border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs text-[var(--muted)]">
                  Обновлено 5 мин назад
                </div>
              </div>
            </section>

            <section className="mt-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {topCards.map((card) => (
                  <article
                    key={card.title}
                    className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm"
                    aria-label={card.title}
                  >
                    <p className="text-sm text-[var(--muted)]">{card.title}</p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums">{card.value}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">{card.note}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm sm:p-6">
              <DashboardSubscriptionMetrics />
            </section>

            <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm sm:p-6">
              <DashboardWeeklyClients />
            </section>

            <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm sm:p-6">
              <DashboardChurnCharts />
            </section>

            <footer className="mt-8 border-t border-[var(--border)] pt-5">
              <Link
                href="/"
                className="text-sm text-[var(--muted)] underline decoration-[var(--border)] underline-offset-2 hover:text-[var(--foreground)]"
              >
                Вернуться на текущую главную
              </Link>
            </footer>
          </div>
        </main>
      </div>
    </div>
  )
}
