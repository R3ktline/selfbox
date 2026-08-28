import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <main className="tool-page">
          <header className="tool-header">
            <span className="panel-eyebrow">Error</span>
            <h1>Something broke</h1>
            <p className="tool-hint">
              This tool hit an unexpected error. Reload the page — files never left your browser, so nothing was uploaded.
            </p>
          </header>
          <div className="panel">
            <pre className="json-output">{this.state.error.message}</pre>
            <button type="button" className="btn primary" style={{ marginTop: 12 }} onClick={() => this.setState({ error: null })}>
              Try again
            </button>
          </div>
        </main>
      )
    }
    return this.props.children
  }
}
