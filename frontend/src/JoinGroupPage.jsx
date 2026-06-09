import './landing.css'

/**
 * Join flow — same visual theme as {@link LandingPage} (maroon + cream + photo).
 */
export function JoinGroupPage({
  groupId,
  groupExists,
  onSubmit,
  onCancel,
  onBackHome,
  error,
}) {
  return (
    <div className="landing landing--join">
      {error ? (
        <div className="landing__banner-error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="landing__body">
        <div className="landing__left landing__join-left">
          <div className="landing__join-upper">
            <div className="landing__join-top-nav">
              <nav className="landing__nav" aria-label="Tagline">
                <span>Where</span>
                <span className="landing__nav--bright">Flavor</span>
                <span>Meets</span>
                <span className="landing__nav--bright">Comfort</span>
              </nav>
            </div>
            <div className="landing__join-hero-wrap">
              <div className="landing__hero-stack landing__join-hero">
                <p className="landing__hero-text landing__hero-text--join">Join group</p>
                <p className="landing__join-code">{groupId}</p>
              </div>
            </div>
          </div>

          <div className="landing__join-lower">
            <form className="landing__join-form" onSubmit={onSubmit}>
              <div className="landing__join-form-fields">
                {!groupExists ? (
                  <p className="landing__join-missing">
                    Group not found yet. Check the code or make sure the backend server is running.
                  </p>
                ) : null}

                {groupExists ? (
                  <p className="landing__join-missing">
                    Ready to add your preferences to this group.
                  </p>
                ) : null}

                <div className="landing__join-actions landing__join-actions--submit-only">
                  <button type="submit" className="landing__btn" disabled={!groupExists}>
                    Join group
                  </button>
                </div>
              </div>

              <div className="landing__join-form-footer">
                <button type="button" className="landing__btn-text" onClick={onCancel}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="landing__continue landing__continue--join"
                  onClick={onBackHome}
                >
                  ← Back to home
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="landing__right" aria-hidden>
          <div className="landing__right-crop">
            <img
              src="/landing-hero.png"
              alt=""
              width={735}
              height={918}
              decoding="async"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
