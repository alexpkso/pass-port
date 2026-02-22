import Link from 'next/link'
import Nav from './components/Nav'
import Breadcrumbs from './components/Breadcrumbs'
import DashboardWeeklyClients from './components/DashboardWeeklyClients'

const navCards = [
  { href: '/clients', title: 'Клиенты', desc: 'Учёт клиентов и подписок', icon: '👥' },
  { href: '/employees', title: 'Сотрудники', desc: 'Список сотрудников и должности', icon: '👤' },
  { href: '/services', title: 'Услуги', desc: 'Список услуг и базовые стоимости', icon: '📋' },
  { href: '/about', title: 'О сервисе', desc: 'Описание сервиса', icon: 'ℹ️' },
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
                src="/pixel-passport.png"
                alt="Бизнесы и цифровое присутствие — Pass-Port"
                className="h-36 w-auto rounded-xl object-contain sm:h-44 lg:h-52"
              />
            </div>
          </div>
        </section>

        {/* Карточки разделов в один ряд */}
        <section className="mt-8 sm:mt-10">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {navCards.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="group flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm transition-all hover:border-blue-500/50 hover:shadow-md sm:p-6"
              >
                <span className="text-2xl sm:text-3xl" aria-hidden>{card.icon}</span>
                <span className="mt-2 text-lg font-medium text-[var(--foreground)] group-hover:text-[var(--accent)]">
                  {card.title}
                </span>
                <span className="mt-1 text-sm text-[var(--muted)]">{card.desc}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Дашборд в отдельной карточке */}
        <section className="mt-8 sm:mt-10">
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm sm:p-6">
            <DashboardWeeklyClients />
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
