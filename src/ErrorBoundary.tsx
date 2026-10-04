import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryState {
  hasError: boolean
}

// Last-resort fallback so an unexpected render error shows a message instead of a blank page.
// It never touches stored data; reloading re-runs the normal load and recovery path.
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('HealthRhythm crashed while rendering', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div className="app-shell">
        <main className="page-shell">
          <section className="card">
            <div className="section-header">
              <h2>Something went wrong</h2>
              <p>Your saved data on this device has not been changed. Reloading usually fixes this.</p>
            </div>
            <div className="action-row">
              <button className="primary-button" type="button" onClick={() => window.location.reload()}>
                Reload
              </button>
            </div>
          </section>
        </main>
      </div>
    )
  }
}
