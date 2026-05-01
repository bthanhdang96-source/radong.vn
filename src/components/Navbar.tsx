import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import './Navbar.css'

const NAV_LINKS = [
  { label: 'Bảng Giá', to: '/' },
  { label: 'Thế giới', to: '/thegioi' },
  { label: 'Tin tức', to: '/#tin-tuc' },
]

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [time, setTime] = useState(new Date())
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme')
    if (saved) {
      return saved as 'light' | 'dark'
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const timeStr = time.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  const dateStr = time.toLocaleDateString('vi-VN', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  return (
    <header className={`navbar${scrolled ? ' navbar--scrolled' : ''}`}>
      <div className="navbar__container">
        <Link to="/" className="navbar__logo">
          <div className="navbar__logo-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="var(--color-primary)" />
              <path d="M8 12c0-2.21 1.79-4 4-4s4 1.79 4 4-1.79 4-4 4-4-1.79-4-4z" fill="var(--color-accent)" />
              <path d="M12 7V5M12 19v-2M17 12h2M5 12H7" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <div className="navbar__logo-text">
            <span className="navbar__logo-main">NôngSản</span>
            <span className="navbar__logo-sub">VN</span>
          </div>
        </Link>

        <nav className="navbar__nav">
          {NAV_LINKS.map(link => {
            const isActive =
              (link.to !== '/' && location.pathname.startsWith(link.to)) ||
              (link.to === '/' && location.pathname === '/')

            return (
              <Link
                key={link.label}
                to={link.to}
                className={`navbar__link${isActive ? ' navbar__link--active' : ''}`}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>

        <div className="navbar__right">
          <div className="navbar__clock">
            <span className="navbar__time">{timeStr}</span>
            <span className="navbar__date">{dateStr}</span>
          </div>
          <div className="navbar__status">
            <span className="navbar__status-dot navbar__status-dot--live" />
            <span className="navbar__status-label">TRỰC TUYẾN</span>
          </div>
          <button
            className="navbar__theme-toggle"
            onClick={() => setTheme(current => (current === 'light' ? 'dark' : 'light'))}
            aria-label="Chuyển chế độ sáng tối"
          >
            {theme === 'dark' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
          <button
            className="navbar__hamburger"
            onClick={() => setMenuOpen(current => !current)}
            aria-label="Mở menu"
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div className="navbar__mobile-menu">
          {NAV_LINKS.map(link => {
            const isActive =
              (link.to !== '/' && location.pathname.startsWith(link.to)) ||
              (link.to === '/' && location.pathname === '/')

            return (
              <Link
                key={link.label}
                to={link.to}
                className={`navbar__mobile-link${isActive ? ' navbar__mobile-link--active' : ''}`}
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </Link>
            )
          })}
        </div>
      ) : null}
    </header>
  )
}
