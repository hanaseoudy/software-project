import { BackButton } from './BackButton';
import { Breadcrumbs } from './Breadcrumbs';

/**
 * Standard top of every page: breadcrumbs, optional Back button, title,
 * short description and the page's main actions on the right.
 */
export function PageHeader({
  title,
  description,
  showBack = false,
  backHref,
  breadcrumbLabel,
  actions,
}: {
  title: string;
  description?: string;
  showBack?: boolean;
  backHref?: string;
  /** Label for the last breadcrumb when the URL ends in an id (e.g. a flight number). */
  breadcrumbLabel?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-header">
      <Breadcrumbs currentLabel={breadcrumbLabel} />
      {showBack && <BackButton fallbackHref={backHref} />}
      <div className="page-header-row">
        <div>
          <h1>{title}</h1>
          {description && <p className="muted">{description}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
    </div>
  );
}
