import { Link } from 'react-router-dom';
import '../components/ops/ops.css';

export function NotFoundPage() {
  return (
    <div className="wrap ops-page ops-404">
      <span className="eb">Error · Not found</span>
      <h1 className="ops-404__num">
        <span className="visually-hidden">Page not found, error </span>
        <em className="serif g">404</em>
      </h1>
      <p className="ops-404__text">This page does not exist, or it moved. The map and every job are still where you left them.</p>
      <div className="btn-row">
        <Link className="btn btn--primary" to="/map">
          Back to the map <span className="ar" aria-hidden="true">→</span>
        </Link>
        <Link className="btn btn--secondary" to="/">
          Go home
        </Link>
      </div>
    </div>
  );
}
