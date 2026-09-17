import type { PrecheckIssue } from '../../engine/types';

/** A precheck warning or error. Severity is never shown by color alone. */
export default function IssueMessage({ issue }: { issue: PrecheckIssue }) {
  const prefix = issue.severity === 'error' ? 'Error' : 'Warning';
  return <p className={`issue issue--${issue.severity}`}>{`${prefix}: ${issue.message}`}</p>;
}
