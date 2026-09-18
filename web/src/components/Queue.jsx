import React from 'react';
import { useI18n } from '../lib/i18n.jsx';
import { JobRow } from './Result.jsx';
import { useAppStore } from '../lib/store.js';

export function QueuePanel({ onCancel, onRetry, onRemove }) {
  const { t } = useI18n();
  const jobs = useAppStore((s) => s.jobs);
  if (!jobs.length) return null;

  const active = jobs.filter((job) => ['queued', 'downloading', 'processing'].includes(job.status));
  const finished = jobs.filter((job) => !['queued', 'downloading', 'processing'].includes(job.status));

  return (
    <section className="queue" aria-labelledby="queue-title">
      <h2 id="queue-title">
        {t('nav.history')}
        {active.length ? <span className="chip chip-hot">{active.length}</span> : null}
      </h2>
      <ul className="job-list">
        {[...active, ...finished].map((job) => (
          <JobRow key={job.id} job={job} onCancel={onCancel} onRetry={onRetry} onRemove={onRemove} />
        ))}
      </ul>
    </section>
  );
}

export default QueuePanel;
