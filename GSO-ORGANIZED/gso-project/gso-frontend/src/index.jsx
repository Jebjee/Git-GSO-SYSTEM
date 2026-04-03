import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Unexpected error' }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f1117', color: '#e8eaf0', padding: '1rem' }}>
          <div style={{ maxWidth: 560, width: '100%', background: '#161b27', border: '1px solid #2a3347', borderRadius: 12, padding: '1.25rem' }}>
            <h2 style={{ margin: 0, marginBottom: '0.5rem', fontSize: '1.2rem' }}>App Error</h2>
            <p style={{ margin: 0, marginBottom: '0.75rem', color: '#93a4bf' }}>
              The page hit a runtime error. Please refresh and log in again.
            </p>
            <code style={{ fontSize: '0.85rem', color: '#fca5a5' }}>{this.state.message}</code>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
)
