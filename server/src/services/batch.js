/**
 * Playlist / multi-URL batches → many jobs → one ZIP file.
 */
import path from 'node:path';
import { resolvePreset } from '../core/formats.js';
import { uniqueName, shortId } from '../core/util.js';

const TERMINAL = new Set(['ready', 'failed', 'canceled', 'expired']);

export function createBatchService({ config, downloader, jobs, logger }) {
  const batches = new Map();

  function view(batch) {
    const jobList = batch.jobIds.map((id) => jobs.get(id)).filter(Boolean);
    const completed = jobList.filter((j) => j.status === 'ready').length;
    const failed = jobList.filter((j) => ['failed', 'canceled', 'expired'].includes(j.status)).length;
    const pending = jobList.length - completed - failed;
    let status = 'queued';
    if (finishedCount(jobList) < jobList.length) status = 'running';
    else if (completed === 0 && failed > 0) status = 'failed';
    else status = 'done';
    return {
      id: batch.id,
      status,
      preset: batch.preset,
      total: batch.total,
      queued: batch.total,
      completed,
      failed,
      pending: Math.max(0, pending),
      skipped: batch.skipped,
      note: batch.note,
      zipReady: status === 'done' && completed > 0,
      createdAt: batch.createdAt,
      // `jobs` is a list of job ids (stable, easy to poll); `jobDetails` carries
      // the full records for UIs that want progress without extra requests.
      jobs: batch.jobIds,
      jobDetails: jobList,
      items: batch.items,
    };
  }

  const finishedCount = (jobList) => jobList.filter((j) => TERMINAL.has(j.status)).length;

  async function create({ urls = [], url = null, preset, maxItems = null, subtitle = null, trim = null }) {
    const chosen = resolvePreset(preset);
    if (!chosen) {
      const err = new Error(`Unknown preset: ${preset}`);
      err.code = 'INVALID_PRESET';
      throw err;
    }
    const inputUrls = [...new Set([...(Array.isArray(urls) ? urls : []), ...(url ? [url] : [])])].filter(Boolean);
    if (!inputUrls.length) {
      const err = new Error('Provide a url or an array of urls.');
      err.code = 'INVALID_INPUT';
      throw err;
    }
    if (inputUrls.length > config.maxBatchSize) {
      const err = new Error(`Too many URLs in one request (max ${config.maxBatchSize}).`);
      err.code = 'INVALID_INPUT';
      throw err;
    }

    const perPlaylist = Math.max(1, Math.min(Number(maxItems) || config.maxPlaylistItems, config.maxPlaylistItems));
    const items = [];
    let skipped = 0;
    const notes = [];

    for (const rawUrl of inputUrls) {
      const { info, parsed } = await downloader.resolveInfo(rawUrl);
      if (parsed.type === 'playlist' && Array.isArray(info.entries)) {
        const entries = info.entries;
        const take = Math.min(entries.length, perPlaylist);
        skipped += Math.max(0, entries.length - take);
        if (entries.length > take) {
          notes.push(`only the first ${take} of ${entries.length} playlist videos were queued`);
        }
        for (const entry of entries.slice(0, take)) {
          items.push({
            url: entry.webpage_url ?? entry.url ?? `https://www.youtube.com/watch?v=${entry.id}`,
            title: entry.title ?? null,
            duration: entry.duration ?? null,
          });
        }
      } else {
        items.push({
          url: parsed.canonicalUrl ?? parsed.url,
          title: info?.title ?? null,
          duration: info?.duration ?? null,
        });
      }
    }

    if (!items.length) {
      const err = new Error('Nothing to download in that link.');
      err.code = 'FORMAT_UNAVAILABLE';
      throw err;
    }

    const batch = {
      id: shortId(),
      preset: chosen.id,
      total: 0,
      skipped,
      note: notes.join('; ') || (skipped ? `${skipped} videos were skipped (limit reached)` : null),
      createdAt: Date.now(),
      jobIds: [],
      items,
    };

    for (const item of items) {
      try {
        const job = jobs.create({
          url: item.url,
          preset: chosen.id,
          kind: chosen.kind,
          title: item.title,
          subtitle,
          trim: chosen.kind === 'video' || chosen.kind === 'audio' ? trim : null,
        });
        batch.jobIds.push(job.id);
      } catch (err) {
        if (err.code === 'QUEUE_FULL') {
          batch.skipped += 1;
          batch.note = [batch.note, 'the server queue was full for the remaining videos'].filter(Boolean).join('; ');
          break;
        }
        throw err;
      }
    }

    batch.total = batch.jobIds.length;
    batches.set(batch.id, batch);
    logger.info?.(`batch ${batch.id}: ${batch.total} jobs (preset ${chosen.id}, skipped ${batch.skipped})`);
    return { batch: view(batch), raw: batch };
  }

  function get(id) {
    const batch = batches.get(String(id));
    return batch ? view(batch) : null;
  }

  function list(limit = 20) {
    return [...batches.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit).map(view);
  }

  /** Files for a finished batch, with de-duplicated names for the archive. */
  function filesForZip(id) {
    const batch = batches.get(String(id));
    if (!batch) return null;
    const used = [];
    const files = [];
    for (const jobId of batch.jobIds) {
      const job = jobs.get(jobId);
      const internal = jobs.peek(jobId);
      if (!job || job.status !== 'ready' || !internal?.filePath) continue;
      const name = uniqueName(path.basename(job.filename ?? `${jobId}.mp4`), used);
      used.push(name);
      files.push({ name, path: internal.filePath, size: job.size ?? 0, jobId });
    }
    return files;
  }

  function remove(id) {
    return batches.delete(String(id));
  }

  return { create, get, list, filesForZip, remove, size: () => batches.size };
}
