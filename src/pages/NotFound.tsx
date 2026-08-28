import { href, navigate } from '../lib/router'
import { searchTools } from '../lib/tools'

export default function NotFound() {
  const suggestions = searchTools('')

  return (
    <main className="home">
      <section className="home-hero home-hero-left">
        <p className="panel-eyebrow">404</p>
        <h1>This path doesn’t exist.</h1>
        <p>The hash in the address bar isn’t a tool. Jump home, or pick one below.</p>
        <div className="hero-actions">
          <a className="btn primary" href={href('/')} onClick={(e) => { e.preventDefault(); navigate('/') }}>
            Back to tools
          </a>
        </div>
      </section>
      <section className="home-section">
        <h2>All tools</h2>
        <div className="tool-grid">
          {suggestions.slice(0, 6).map((t) => (
            <a key={t.path} className="tool-card" href={href(t.path)}>
              <div className="tool-text">
                <h3>{t.title}</h3>
                <p>{t.desc}</p>
              </div>
              <span className="tool-arrow" aria-hidden="true">↗</span>
            </a>
          ))}
        </div>
      </section>
    </main>
  )
}
