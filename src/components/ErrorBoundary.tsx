import { Component, type ReactNode } from "react";

/**
 * Keeps a crash in one page or form from blanking the whole app. The app remembers the last page, so
 * without this a page that throws would throw again on every reload. It says what happened and offers a
 * way out; Undo is there too, in case the last change caused it. Keyed by page, so moving on resets it.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; onLeave: () => void; onUndo?: () => void; what: string; floating?: boolean }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const box = (
      <div className="panel crash" role="alert">
        <h3 style={{ marginTop: 0 }}>Something went wrong on {this.props.what}</h3>
        <p className="small muted">Your plan is safe. Undo the last change, or go to the Overview. If it happens again, Settings › About › Send feedback, with what you did and this message: <code>{error.message}</code></p>
        <div className="row gap wrap">
          {this.props.onUndo && <button className="btn" onClick={() => { this.props.onUndo!(); this.setState({ error: null }); }}>Undo the last change</button>}
          <button className="btn primary" onClick={this.props.onLeave}>Go to the Overview</button>
        </div>
      </div>
    );
    // A form that fails shows this where the form was, over the page.
    return this.props.floating ? <div className="backdrop">{box}</div> : box;
  }
}
