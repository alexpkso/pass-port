import Link from 'next/link'
import Nav from './components/Nav'
import Breadcrumbs from './components/Breadcrumbs'
import DashboardChurnCharts from './components/DashboardChurnCharts'
import DashboardSubscriptionMetrics from './components/DashboardSubscriptionMetrics'
import DashboardWeeklyClients from './components/DashboardWeeklyClients'

const iconClass = 'size-8 sm:size-9 text-[var(--accent)] opacity-90 group-hover:opacity-100 transition-opacity'

const navCards = [
  {
    href: '/clients',
    title: 'Клиенты',
    desc: 'Учёт клиентов и подписок',
    icon: (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    href: '/employees',
    title: 'Сотрудники',
    desc: 'Список сотрудников и должности',
    icon: (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  {
    href: '/services',
    title: 'Услуги',
    desc: 'Список услуг и базовые стоимости',
    icon: (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
  },
  {
    href: '/reports',
    title: 'Отчёты',
    desc: 'Карточка 62 счёта и задолженности',
    icon: (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    href: '/about',
    title: 'О сервисе',
    desc: 'Описание сервиса',
    icon: (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
]

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Nav />
      <main className="mx-auto max-w-[84rem] px-4 py-6 sm:px-6 sm:py-10">
        <Breadcrumbs items={[{ href: '/', label: 'Главная' }]} />

        {/* Hero: заголовок + картинка в одном блоке */}
        <section className="mt-4 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm sm:mt-6">
          <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:p-8 lg:p-10">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
                Pass-Port — управление подписками
              </h1>
              <p className="mt-3 text-base text-[var(--muted-foreground)] sm:text-lg">
                Управляйте клиентами и подписками в одном месте.
              </p>
            </div>
            <div className="flex shrink-0 justify-center sm:justify-end">
              <img
                src="/pixel-hero.gif"
                alt="Локальный бизнес и цифровое присутствие — отзывы, карты, соцсети"
                className="h-36 w-auto rounded-xl object-contain sm:h-44 lg:h-52"
              />
            </div>
          </div>
        </section>

        {/* Метрики подписной модели */}
        <section className="mt-8 sm:mt-10">
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm sm:p-6">
            <DashboardSubscriptionMetrics />
          </div>
        </section>

        {/* Карточки разделов в один ряд */}
        <section className="mt-8 sm:mt-10">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
            {navCards.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="group flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm transition-colors hover:border-[var(--accent)]/50 hover:shadow-sm sm:p-6"
              >
                {card.icon}
                <span className="mt-2 text-lg font-medium text-[var(--foreground)] group-hover:text-[var(--accent)]">
                  {card.title}
                </span>
                <span className="mt-1 text-sm text-[var(--muted)]">{card.desc}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Дашборд: клиенты по неделям */}
        <section className="mt-8 sm:mt-10">
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm sm:p-6">
            <DashboardWeeklyClients />
          </div>
        </section>

        {/* Расшифровка метрик: Churn Rate */}
        <section className="mt-8 sm:mt-10">
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm sm:p-6">
            <DashboardChurnCharts />
          </div>
        </section>

        {/* Ссылка на сайт */}
        <footer className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[var(--border)] pt-6 sm:mt-10">
          <a
            href="https://pass-port.ru/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[var(--muted)] underline decoration-[var(--border)] underline-offset-2 hover:text-[var(--foreground)] hover:decoration-[var(--accent)]"
          >
            Перейти на pass-port.ru
          </a>
        </footer>
      </main>
    </div>
  )
}
