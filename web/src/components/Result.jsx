import React, { useState } from 'react';
import { useI18n } from '../lib/i18n.jsx';
import { humanBytes, humanDuration, humanCount, prettyDate } from '../lib/format.js';

const TABS = ['video', 'audio', 'subtitles', 'thumbnail'];

export function VideoCard({ info, meta, tab, setTab, trim, setTrim, subtitle, setSubtitle, onDownload, busyJob }) {
  const { t } = useI18n();
  if (!info) return null;

  if (info.type === 'playlist' && info.playlist) {
    return (
      <section className="video-card" aria-labelledby="playlist-title">
        <h2 id="playlist-title">{info.playlist.title}</h2>
        <p className="muted">{info.playlist.count} videos · {t('batch.title')}</p>
        <ol className="playlist-list">
          {info.playlist.entries.map((entry) => (
            <li key={`${entry.id}-${entry.index}`}>
              <span className="playlist-index">{entry.index}</span>
              <span className="playlist-title">{entry.title}</span>
              <span className="muted">{humanDuration(entry.duration)}</span>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  const video = info.video ?? {};
  const qualities = info.formats?.video ?? [];

  return (
    <section className="video-card" aria-labelledby="video-title">
      <div className="video-head">
        {video.thumbnail ? (
          <img
            className="video-thumb"
            src={video.thumbnail}
            alt=""
            width="168"
            height="94"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : null}
        <div>
          <h2 id="video-title">{video.title}</h2>
          <p className="muted">
            {[video.channel, video.durationText ?? humanDuration(video.duration), video.viewCountText ?? (video.viewCount ? `${humanCount(video.viewCount)} views` : null), prettyDate(video.uploadDate)]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label={t('quality.title')}>
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`panel-${key}`}
            tabIndex={tab === key ? 0 : -1}
            className={tab === key ? 'tab is-active' : 'tab'}
            onClick={() => setTab(key)}
          >
            {t(`tab.${key === 'subtitles' ? 'subtitles' : key}`)}
          </button>
        ))}
      </div>

      {tab === 'video' ? (
        <div role="tabpanel" id="panel-video" aria-labelledby="tab-video">
          <FormatTable formats={qualities} onDownload={onDownload} busyJob={busyJob} />
          <TrimControls trim={trim} setTrim={setTrim} onDownload={onDownload} busyJob={busyJob} />
        </div>
      ) : null}

      {tab === 'audio' ? (
        <div role="tabpanel" id="panel-audio" aria-labelledby="tab-audio">
          <PresetList
            presets={(meta?.presets ?? []).filter((p) => p.kind === 'audio')}
            onDownload={onDownload}
            busyJob={busyJob}
          />
          <TrimControls trim={trim} setTrim={setTrim} onDownload={onDownload} busyJob={busyJob} audio />
        </div>
      ) : null}

      {tab === 'subtitles' ? (
        <div role="tabpanel" id="panel-subtitles" aria-labelledby="tab-subtitles">
          <SubtitleList info={info} subtitle={subtitle} setSubtitle={setSubtitle} onDownload={onDownload} busyJob={busyJob} />
        </div>
      ) : null}

      {tab === 'thumbnail' ? (
        <div role="tabpanel" id="panel-thumbnail" aria-labelledby="tab-thumbnail">
          <ThumbnailGrid info={info} onDownload={onDownload} busyJob={busyJob} />
        </div>
      ) : null}
    </section>
  );
}

export function FormatTable({ formats, onDownload, busyJob }) {
  const { t } = useI18n();
  if (!formats?.length) return <p className="muted">{t('error.formatUnavailable')}</p>;

  return (
    <div className="table-wrap">
      <table aria-label={`${t('quality.title')} — available formats and quality`}>
        <caption className="sr-only">{t('quality.title')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('preset.resolution')}</th>
            <th scope="col">{t('preset.codec')}</th>
            <th scope="col">{t('preset.size')}</th>
            <th scope="col"><span className="sr-only">{t('preset.download')}</span></th>
          </tr>
        </thead>
        <tbody>
          {formats.map((format) => (
            <tr key={format.id}>
              <td>
                <strong>{format.heightLabel ?? format.label}</strong>
                {format.fps ? <span className="muted"> · {format.fps}fps</span> : null}
                {format.hdr ? <span className="chip">{format.hdr}</span> : null}
              </td>
              <td className="muted">{(format.vcodec || 'mp4').split('.')[0]}{format.needsMux ? ' + audio' : ''}</td>
              <td className="muted">{format.sizeText ?? humanBytes(format.size)}</td>
              <td className="right">
                <button
                  type="button"
                  className="primary-btn small"
                  onClick={() => onDownload({ preset: presetForHeight(format.height), kind: 'video', row: format })}
                  disabled={busyJob}
                  aria-label={`${t('preset.download')} ${format.heightLabel ?? format.label} — ${format.sizeText ?? ''}`}
                >
                  {t('preset.download')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small-note">{t('preset.mergeNote')}</p>
    </div>
  );
}

export function presetForHeight(height) {
  const map = { 4320: 'mp4-4320', 2160: 'mp4-2160', 1440: 'mp4-1440', 1080: 'mp4-1080', 720: 'mp4-720', 480: 'mp4-480', 360: 'mp4-360', 240: 'mp4-240' };
  return map[height] ?? 'best';
}

export function PresetList({ presets, onDownload, busyJob }) {
  const { t } = useI18n();
  if (!presets.length) return <p className="muted">{t('preset.audioOnly')} — MP3 · M4A · OPUS</p>;
  return (
    <ul className="preset-list">
      {presets.map((preset) => (
        <li key={preset.id}>
          <div>
            <strong>{preset.label}</strong>
            {preset.popular ? <span className="chip chip-hot">{t('preset.popular')}</span> : null}
            {preset.bitrate ? <small className="muted"> · {preset.bitrate}</small> : null}
          </div>
          <button
            type="button"
            className="primary-btn small"
            onClick={() => onDownload({ preset: preset.id, kind: preset.kind })}
            disabled={busyJob}
          >
            {t('preset.download')}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function TrimControls({ trim, setTrim, onDownload, busyJob, audio = false }) {
  const { t } = useI18n();
  const valid = trim.start !== '' && trim.end !== '' && Number(trim.end) > Number(trim.start);
  return (
    <fieldset className="trim">
      <legend>{t('trim.title')}</legend>
      <div className="trim-row">
        <label htmlFor="trim-start">{t('trim.start')}
          <input
            id="trim-start"
            type="number"
            min="0"
            step="0.5"
            inputMode="decimal"
            value={trim.start}
            onChange={(event) => setTrim({ ...trim, start: event.target.value })}
          />
        </label>
        <label htmlFor="trim-end">{t('trim.end')}
          <input
            id="trim-end"
            type="number"
            min="0"
            step="0.5"
            inputMode="decimal"
            value={trim.end}
            onChange={(event) => setTrim({ ...trim, end: event.target.value })}
          />
        </label>
        <button
          type="button"
          className="primary-btn small"
          disabled={!valid || busyJob}
          onClick={() => onDownload({
            preset: audio ? 'mp3-320' : 'mp4-1080',
            kind: audio ? 'audio' : 'video',
            trim: { start: Number(trim.start), end: Number(trim.end) },
          })}
        >
          {t('trim.apply')}
        </button>
      </div>
      <p className="muted small-note">{t('trim.hint')}</p>
    </fieldset>
  );
}

export function SubtitleList({ info, subtitle, setSubtitle, onDownload, busyJob }) {
  const { t } = useI18n();
  const manual = info.subtitles?.manual ?? [];
  const auto = info.subtitles?.auto ?? [];
  const all = [...manual, ...auto];
  if (!all.length) return <p className="muted">{t('tab.subtitles')} — {t('error.notFound')}</p>;

  return (
    <div className="subtitle-panel">
      <div className="subtitle-controls">
        <label htmlFor="subtitle-lang">{t('tab.subtitles')}
          <select
            id="subtitle-lang"
            value={`${subtitle.auto ? 'auto:' : ''}${subtitle.lang}`}
            onChange={(event) => {
              const [maybeAuto, lang = 'en'] = event.target.value.split(':');
              setSubtitle({ auto: maybeAuto === 'auto', lang });
            }}
          >
            {manual.map((s) => <option key={`m-${s.lang}`} value={s.lang}>{s.label} ({s.lang})</option>)}
            {auto.map((s) => <option key={`a-${s.lang}`} value={`auto:${s.lang}`}>{s.label} — {s.lang}</option>)}
          </select>
        </label>
        <button
          type="button"
          className="primary-btn small"
          disabled={busyJob}
          onClick={() => onDownload({ preset: 'subtitle-srt', kind: 'subtitle', subtitle })}
        >
          {t('preset.download')} .srt
        </button>
      </div>
      <ul className="subtitle-list">
        {manual.map((s) => <li key={`l-${s.lang}`}><span className="chip">{s.lang}</span> {s.label}</li>)}
      </ul>
      <p className="muted small-note">{t('features.f5.body')}</p>
    </div>
  );
}

export function ThumbnailGrid({ info, onDownload, busyJob }) {
  const { t } = useI18n();
  const thumbs = info.thumbnails ?? [];
  if (!thumbs.length) return <p className="muted">{t('tab.thumbnail')} — {t('error.notFound')}</p>;
  return (
    <ul className="thumb-grid">
      {thumbs.map((thumb) => (
        <li key={thumb.id}>
          <img src={thumb.url} alt="" width="160" height="90" loading="lazy" />
          <div className="thumb-meta">
            <span className="muted">{thumb.width ? `${thumb.width}×${thumb.height}` : thumb.id}</span>
            <div className="thumb-actions">
              <a className="ghost-btn" href={thumb.url} download aria-label={`${t('preset.download')} thumbnail ${thumb.id}`}>
                {t('preset.download')}
              </a>
              <button
                type="button"
                className="ghost-btn"
                disabled={busyJob}
                onClick={() => onDownload({ preset: 'thumbnail-max', kind: 'image', thumbnailId: thumb.id })}
              >
                {t('job.save')}
              </button>
            </div>
            <span className="sr-only">{thumb.id}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function JobRow({ job, onCancel, onRetry, onRemove }) {
  const { t } = useI18n();
  const percent = Math.round(job.progress?.percent ?? 0);
  const statusKey = job.status === 'ready' ? 'ready'
    : job.status === 'failed' ? 'failed'
      : job.status === 'canceled' ? 'canceled'
        : job.status === 'expired' ? 'expired'
          : job.progress?.stage === 'merging' ? 'merging'
            : job.progress?.stage === 'converting' ? 'converting'
              : job.status === 'queued' ? 'queued'
                : 'downloading';

  return (
    <li className="job" data-status={job.status}>
      <div className="job-head">
        <strong>{job.title || job.filename || job.preset}</strong>
        <span className="muted">{job.preset}</span>
      </div>

      {['queued', 'downloading', 'processing'].includes(job.status) ? (
        <>
          <div
            className="progress"
            role="progressbar"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={percent}
            aria-label={t('a11y.progress')}
          >
            <span style={{ width: `${Math.max(2, percent)}%` }} />
          </div>
          <p className="muted small-note">
            {t(`job.${statusKey}`, { percent })}
            {job.progress?.speed ? ` · ${t('job.speed')} ${job.progress.speed}` : ''}
            {job.progress?.eta ? ` · ${t('job.eta')} ${job.progress.eta}s` : ''}
          </p>
          <div className="job-actions">
            <button type="button" className="ghost-btn" onClick={() => onCancel(job.id)}>{t('job.cancel')}</button>
          </div>
        </>
      ) : null}

      {job.status === 'ready' ? (
        <p className="job-ready">
          <a className="primary-btn small" href={job.fileUrl} download aria-label={t('job.save')}>
            {t('job.save')}
          </a>
          <span className="muted">{job.sizeText ?? humanBytes(job.size)} · {job.quality ?? ''} {job.needsMux ? '· merged audio' : ''}</span>
        </p>
      ) : null}

      {['failed', 'canceled', 'expired'].includes(job.status) ? (
        <p className="error" role="alert">
          {t(`error.${errorKey(job.error?.code)}`, {})}
          <button type="button" className="ghost-btn" onClick={() => onRetry(job.id)}>{t('job.retry')}</button>
          <button type="button" className="ghost-btn" onClick={() => onRemove(job.id)}>{t('job.remove')}</button>
        </p>
      ) : null}
    </li>
  );
}

function errorKey(code) {
  const map = {
    INVALID_URL: 'invalidUrl', BLOCKED_HOST: 'blockedHost', INVALID_VIDEO_ID: 'invalidVideoId',
    UNSUPPORTED_URL: 'unsupportedUrl', VIDEO_UNAVAILABLE: 'videoUnavailable', PRIVATE_VIDEO: 'privateVideo',
    BOT_CHECK: 'botCheck', GEO_BLOCKED: 'geoBlocked', FORMAT_UNAVAILABLE: 'formatUnavailable',
    RATE_LIMITED: 'rateLimited', QUEUE_FULL: 'queueFull', DOWNLOAD_FAILED: 'downloadFailed',
    FFMPEG_FAILED: 'ffmpegFailed', NOT_FOUND: 'notFound', INVALID_PRESET: 'invalidPreset',
    INVALID_TRIM: 'invalidTrim', NETWORK: 'network',
  };
  return map[code] ?? 'downloadFailed';
}

export { errorKey };
