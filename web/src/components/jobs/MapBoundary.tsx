import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface State {
  failed: boolean;
}

/** If the map throws, the page keeps its panel, list and job card; the map area shows a short notice. */
export class MapBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Map failed to render', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="m2-note" role="status">
        <p>The map could not load. The job list still works.</p>
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => this.setState({ failed: false })}>
          Reload the map
        </button>
      </div>
    );
  }
}
