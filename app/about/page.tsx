import Nav from '../components/Nav'
import Breadcrumbs from '../components/Breadcrumbs'

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Nav />
      <main className="mx-auto max-w-[84rem] px-4 py-8 sm:px-6">
        <Breadcrumbs items={[{ href: '/', label: 'Главная' }, { href: '/about', label: 'О сервисе' }]} />
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          О сервисе
        </h1>
        <p className="mt-6 text-lg text-[var(--muted-foreground)]">
          Сервис учета услуг по подписной системе.
        </p>
      </main>
    </div>
  )
}
