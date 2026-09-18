/** Hand-written OpenAPI 3 document — a real differentiator vs. competitors. */
export function buildOpenApi({ version, config }) {
  const errorSchema = {
    type: 'object',
    properties: {
      error: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          message: { type: 'string' },
          details: { type: 'object', additionalProperties: true },
        },
        required: ['code', 'message'],
      },
    },
  };
  const errorResponse = (description) => ({
    description,
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
  });

  const jobSchema = {
    type: 'object',
    properties: {
      id: { type: 'string' },
      status: { type: 'string', enum: ['queued', 'downloading', 'processing', 'ready', 'failed', 'canceled', 'expired'] },
      url: { type: 'string' },
      preset: { type: 'string' },
      title: { type: 'string', nullable: true },
      filename: { type: 'string', nullable: true },
      fileUrl: { type: 'string', nullable: true },
      size: { type: 'integer', nullable: true },
      height: { type: 'integer', nullable: true },
      needsMux: { type: 'boolean' },
      qualityFallback: { type: 'integer', nullable: true },
      engine: { type: 'string', nullable: true },
      expiresAt: { type: 'integer' },
      progress: {
        type: 'object',
        properties: {
          stage: { type: 'string' },
          percent: { type: 'number' },
          speed: { type: 'string', nullable: true },
          eta: { type: 'integer', nullable: true },
          downloaded: { type: 'integer', nullable: true },
          total: { type: 'integer', nullable: true },
        },
      },
      error: { type: 'object', nullable: true, properties: { code: { type: 'string' }, message: { type: 'string' } } },
    },
  };

  return {
    openapi: '3.0.3',
    info: {
      title: 'YouTube Downloader API',
      version,
      description: [
        'Free REST API behind the downloader UI: metadata, format catalogues, download jobs with',
        'live progress, playlists → ZIP, subtitles, thumbnails and trimming.',
        'No API key required; please respect the rate limits.',
      ].join(' '),
      license: { name: 'MIT' },
    },
    servers: [{ url: '/', description: 'This server' }],
    tags: [
      { name: 'meta', description: 'Service information' },
      { name: 'media', description: 'Look up media information' },
      { name: 'jobs', description: 'Create and manage download jobs' },
      { name: 'files', description: 'Download produced files' },
      { name: 'events', description: 'Real-time progress' },
    ],
    paths: {
      '/api/health': {
        get: {
          tags: ['meta'],
          summary: 'Service health and engine availability',
          responses: {
            200: {
              description: 'OK',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string' },
                      mode: { type: 'string', enum: ['demo', 'live'] },
                      version: { type: 'string' },
                      uptime: { type: 'number' },
                      engines: { type: 'object' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/meta': {
        get: {
          tags: ['meta'],
          summary: 'Presets, limits, languages and feature flags',
          responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'object' } } } } },
        },
      },
      '/api/info': {
        post: {
          tags: ['media'],
          summary: 'Resolve a video or playlist URL',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['url'],
                  properties: {
                    url: { type: 'string', description: 'YouTube (or any yt-dlp supported) URL' },
                    refresh: { type: 'boolean', description: 'Bypass the metadata cache' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Metadata + format catalogue', content: { 'application/json': { schema: { type: 'object' } } } },
            400: errorResponse('Invalid URL / blocked host / invalid input'),
            429: errorResponse('Rate limited'),
          },
        },
      },
      '/api/jobs': {
        get: {
          tags: ['jobs'],
          summary: 'List jobs',
          parameters: [
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 100 } },
          ],
          responses: { 200: { description: 'Jobs + stats', content: { 'application/json': { schema: { type: 'object' } } } } },
        },
        post: {
          tags: ['jobs'],
          summary: 'Create a download job',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['url', 'preset'],
                  properties: {
                    url: { type: 'string' },
                    preset: { type: 'string', example: 'mp4-1080' },
                    title: { type: 'string' },
                    trim: {
                      type: 'object',
                      properties: { start: { type: 'number' }, end: { type: 'number' } },
                    },
                    subtitle: {
                      type: 'object',
                      properties: { lang: { type: 'string' }, auto: { type: 'boolean' } },
                    },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Job created', content: { 'application/json': { schema: { type: 'object', properties: { job: jobSchema } } } } },
            400: errorResponse('Invalid input'),
            429: errorResponse('Rate limited or queue full'),
          },
        },
      },
      '/api/jobs/{id}': {
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        get: {
          tags: ['jobs'],
          summary: 'Get one job',
          responses: { 200: { description: 'Job', content: { 'application/json': { schema: { type: 'object', properties: { job: jobSchema } } } } }, 404: errorResponse('Not found') },
        },
        delete: { tags: ['jobs'], summary: 'Forget a job (and delete its file)', responses: { 204: { description: 'Deleted' }, 404: errorResponse('Not found') } },
      },
      '/api/jobs/{id}/cancel': {
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        post: { tags: ['jobs'], summary: 'Cancel a queued/running job', responses: { 200: { description: 'Canceled' }, 404: errorResponse('Not found'), 409: errorResponse('Already finished') } },
      },
      '/api/jobs/{id}/retry': {
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        post: { tags: ['jobs'], summary: 'Retry a failed/expired job', responses: { 200: { description: 'Queued again' }, 404: errorResponse('Not found') } },
      },
      '/api/jobs/{id}/status': {
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        get: { tags: ['jobs'], summary: 'Lightweight polling endpoint (SSE fallback)', responses: { 200: { description: 'Job status' }, 404: errorResponse('Not found') } },
      },
      '/api/batch': {
        post: {
          tags: ['jobs'],
          summary: 'Queue a playlist or several URLs',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    url: { type: 'string' },
                    urls: { type: 'array', items: { type: 'string' } },
                    preset: { type: 'string' },
                    maxItems: { type: 'integer' },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Batch created' }, 400: errorResponse('Invalid input') },
        },
      },
      '/api/batch/{id}': {
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        get: { tags: ['jobs'], summary: 'Batch progress', responses: { 200: { description: 'Batch' }, 404: errorResponse('Not found') } },
      },
      '/api/batch/{id}/zip': {
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        get: {
          tags: ['files'],
          summary: 'Download every finished file as one ZIP',
          responses: { 200: { description: 'ZIP archive', content: { 'application/zip': {} } }, 404: errorResponse('Not found'), 409: errorResponse('Batch still running') },
        },
      },
      '/api/files/{id}': {
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        get: {
          tags: ['files'],
          summary: 'Download the finished file (supports HTTP Range for resume)',
          responses: {
            200: { description: 'File', content: { 'application/octet-stream': {} } },
            206: { description: 'Partial content' },
            404: errorResponse('Not found'),
            410: errorResponse('File expired'),
          },
        },
      },
      '/api/events': {
        get: {
          tags: ['events'],
          summary: 'Server-Sent Events stream of job updates',
          description: 'Event names: `hello`, `job:update`, `job:progress`, `job:done`, `ping`.',
          responses: { 200: { description: 'text/event-stream', content: { 'text/event-stream': { schema: { type: 'string' } } } } },
        },
      },
    },
    components: {
      schemas: {
        Error: errorSchema,
        Job: jobSchema,
      },
    },
    'x-rate-limits': {
      general: `${config.rateLimitMax} requests / ${Math.round(config.rateLimitWindowMs / 1000)}s per IP`,
      jobs: `${config.heavyRateLimitMax} job creations / ${Math.round(config.rateLimitWindowMs / 1000)}s per IP`,
      queue: config.maxQueueLength,
    },
    'x-presets': undefined,
  };
}
