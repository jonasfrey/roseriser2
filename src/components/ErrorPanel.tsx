import type { ParseIssue } from '../types';

interface ErrorPanelProps {
  title: string;
  fatal?: string | null;
  issues: ParseIssue[];
}

export function ErrorPanel({ title, fatal, issues }: ErrorPanelProps) {
  if (!fatal && issues.length === 0) return null;
  return (
    <div className={`errpanel ${fatal ? 'errpanel--fatal' : ''}`}>
      <div className="errpanel__title">{title}</div>
      {fatal && <div className="errpanel__fatal">{fatal}</div>}
      {issues.length > 0 && (
        <ul className="errpanel__list">
          {issues.map((iss, i) => (
            <li key={i} className={`errpanel__item errpanel__item--${iss.severity}`}>
              <span className="errpanel__badge">{iss.severity}</span>
              {iss.entityType && <span className="errpanel__etype">{iss.entityType}</span>}
              {iss.handle && <span className="errpanel__handle">handle {iss.handle}</span>}
              <span className="errpanel__msg">{iss.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
