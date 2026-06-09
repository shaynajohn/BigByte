import { useState } from 'react'
import './landing.css'

/**
 * Landing screen from Figma (node 1:2): group create + join entry.
 */
export function LandingPage({ error, onCreateGroup, onJoinSubmit, onNavigateToGroup }) {
  const [generatedCode, setGeneratedCode] = useState(null)
  const [joinCode, setJoinCode] = useState('')

  function handleCreate() {
    const id = onCreateGroup()
    setGeneratedCode(id)
  }

  function handleJoin(e) {
    e.preventDefault()
    onJoinSubmit(joinCode)
  }

  return (
    <div className="landing">
      {error ? (
        <div className="landing__banner-error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="landing__body">
        <div className="landing__left">
          <div className="landing__left-top">
            <nav className="landing__nav" aria-label="Tagline">
              <span>Where</span>
              <span className="landing__nav--bright">Flavor</span>
              <span>Meets</span>
              <span className="landing__nav--bright">Comfort</span>
            </nav>
          </div>

          <div className="landing__left-mid">
            <div className="landing__hero-stack">
              <p className="landing__hero-text">Turn your meal into a</p>
              <h1 className="landing__logo">BigByte</h1>
            </div>
          </div>

          <div className="landing__left-bottom">
            <div className="landing__actions">
              <div className="landing__actions-col" aria-label="Join a group">
                <form onSubmit={handleJoin}>
                  <button type="submit" className="landing__btn">
                    Join a group
                  </button>
                  <input
                    className="landing__input"
                    type="text"
                    name="joinCode"
                    autoComplete="off"
                    placeholder="Enter join code here"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    aria-label="Join code"
                  />
                </form>
              </div>
              <div className="landing__actions-col" aria-label="Create group">
                <button type="button" className="landing__btn landing__btn--create" onClick={handleCreate}>
                  Create group
                </button>
                <div className="landing__code-area">
                  {generatedCode ? (
                    <code>{generatedCode}</code>
                  ) : (
                    <span className="landing__code-placeholder">Code will appear here</span>
                  )}
                </div>
                {generatedCode ? (
                  <button
                    type="button"
                    className="landing__continue"
                    onClick={() => onNavigateToGroup(generatedCode)}
                  >
                    Continue to group →
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="landing__right" aria-hidden>
          <div className="landing__right-crop">
            <img
              src="/landing-hero.png"
              alt=""
              width={750}
              height={1000}
              decoding="async"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
