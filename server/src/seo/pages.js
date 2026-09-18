/**
 * SEO page catalogue — one entry per keyword cluster people actually search for
 * (the pages competitors rank with), in ONE place so that:
 *
 *   • the server renders them as crawlable HTML for bots that do not run JS
 *     (app.js → /sitemap.xml and the per-route shell),
 *   • the React app renders the very same content for visitors,
 *   • tests can assert both stay in sync (unique titles, FAQ ↔ schema, links).
 *
 * Rules for adding a page: one intent per slug, real content (not keyword soup),
 * 4+ FAQs, internal links to related pages, and honest claims only.
 */

const HOME = '/';

/** Small helper so the content below stays readable. */
function page(config) {
  return {
    lang: 'en',
    related: [],
    ...config,
  };
}

export const SEO_PAGES = [
  page({
    slug: '/youtube-video-downloader',
    title: 'YouTube Video Downloader — Free 4K, 1080p & MP3 (No Ads)',
    description:
      'Free YouTube video downloader: save any video in 4K, 1440p or 1080p as MP4 with the audio merged, or extract MP3 320 kbps. No ads, no popups, no sign-up.',
    h1: 'YouTube Video Downloader',
    keywords: ['youtube video downloader', 'yt video downloader', 'download youtube video free'],
    intro:
      'Paste a YouTube link and download the real file — 8K, 4K, 1440p, 1080p, 720p or 480p as MP4, or just the audio as MP3 up to 320 kbps. Free, no ads, no popups, no sign-up, and it works on phone, tablet and desktop.',
    sections: [
      {
        h2: 'Recommended by people who are tired of fake buttons',
        paras: [
          'Most downloader sites show five "Download" buttons and only one of them works — usually the slowest one. Here there is a single button per format, and each row shows the real resolution, the codec and the honest file size before you click.',
          'The page never reloads, opens no pop-up and shows no interstitial. You paste, you pick a quality, you get the file.',
        ],
      },
      {
        h2: 'What you can download',
        table: {
          head: ['Format', 'Quality', 'Typical use'],
          rows: [
            ['MP4 (H.264, VP9, AV1)', '8K · 4K · 1440p · 1080p60 · 1080p · 720p · 480p · 360p · 240p', 'Watching on any device or TV'],
            ['MP3', '320 · 192 · 128 kbps', 'Music, podcasts, offline listening'],
            ['M4A (AAC)', '192 kbps', 'iPhone, Apple Music, small files'],
            ['OPUS', '160 kbps', 'Best quality per megabyte'],
            ['WAV / FLAC', 'Lossless', 'Editing, sampling, archiving'],
            ['SRT subtitles', 'All available languages', 'Study, translation, accessibility'],
            ['JPEG thumbnail', '120×90 … 1280×720', 'Covers, previews'],
            ['JSON metadata', 'Complete video info', 'Automation, archives'],
          ],
        },
      },
      {
        h2: 'Why high-resolution downloads need a server with ffmpeg',
        paras: [
          'YouTube stores 1080p and above as two separate streams: a video-only stream and an audio-only stream. If a site does not merge them, you get either a silent video or a 360p fallback. This app downloads both streams and merges them with ffmpeg before handing you the file, so a 4K download really has sound.',
        ],
        bullets: [
          'Video and audio are muxed with ffmpeg (-c copy, no quality loss)',
          'The format table tells you when a merge is needed',
          'If the video has no 4K, the app says so instead of pretending',
        ],
      },
      {
        h2: 'Works with every kind of YouTube link',
        paras: [
          'youtube.com/watch, youtu.be short links, YouTube Shorts, YouTube Music, /embed/ links, live replays, premieres and playlists — including all the extra parameters YouTube adds when you share from the app (t=, si=, feature=, index=).',
        ],
      },
    ],
    faqs: [
      { q: 'Is this YouTube video downloader really free?', a: 'Yes. No account, no payment, no premium tier and no daily limit badge. The code is open source (MIT) and can be self-hosted, so it cannot be put behind a paywall.' },
      { q: 'Why do some sites only offer 360p or 720p?', a: 'Because merging the separate high-resolution video and audio streams needs ffmpeg on the server. Without it a site can only offer the pre-muxed low resolution stream.' },
      { q: 'Can I download without installing anything?', a: 'Yes — it runs in your browser on Android, iPhone, iPad, Windows, macOS and Linux, and can be installed as a PWA with "Add to Home Screen" if you want an app icon.' },
      { q: 'Do you keep my files or track me?', a: 'No. There are no ads, no analytics and no tracking scripts. Files are deleted automatically when they expire and the only server-side counter is an anonymous per-IP rate limit.' },
      { q: 'Is downloading YouTube videos legal?', a: 'Download only videos you own, videos licensed for reuse (for example Creative Commons) or videos you have permission to save, and follow YouTube’s Terms of Service and your local copyright law.' },
    ],
    related: ['/youtube-mp3-downloader', '/youtube-playlist-downloader', '/youtube-4k-downloader', '/youtube-shorts-downloader'],
  }),

  page({
    slug: '/youtube-mp3-downloader',
    title: 'YouTube MP3 Downloader — 320 kbps Audio (Free, No Ads)',
    description:
      'Convert YouTube videos to MP3 320, 192 or 128 kbps, or M4A, OPUS, WAV and FLAC. Audio is extracted with ffmpeg — no fake converters, no popups, no sign-up.',
    h1: 'YouTube to MP3 Downloader',
    keywords: ['youtube mp3 downloader', 'youtube to mp3', 'yt mp3 320kbps', 'youtube audio download'],
    intro:
      'Paste a link, open the Audio tab and pick MP3 320 kbps for music, M4A for iPhone, OPUS for the smallest files, or WAV/FLAC when you need lossless audio. Conversion happens on the server with ffmpeg — not in a fake “converting…” overlay.',
    sections: [
      {
        h2: 'Which audio format should you choose?',
        table: {
          head: ['Format', 'Bitrate', 'Best for'],
          rows: [
            ['MP3', '320 kbps', 'Music, car stereos, every player'],
            ['MP3', '192 / 128 kbps', 'Podcasts, audiobooks, saving space'],
            ['M4A (AAC)', '192 kbps', 'iPhone, iPad, best quality per MB'],
            ['OPUS', '160 kbps', 'Smallest files at high quality'],
            ['WAV', 'Lossless', 'Editing in a DAW'],
            ['FLAC', 'Lossless', 'Archiving with compression'],
          ],
        },
      },
      {
        h2: 'How the audio extraction works',
        paras: [
          'The app asks YouTube for the best audio-only stream, downloads it, then runs ffmpeg to convert it to the codec and bitrate you chose. That is the same tool used by every serious audio pipeline — which is why the MP3 you get is a real 320 kbps file and not a re-encoded 128 kbps stream with a louder label.',
        ],
        bullets: [
          'No re-encoding when the source codec already matches (M4A/OPUS)',
          'Real bitrate reported by ffprobe, not guessed',
          'Trim support: cut a 30-second ringtone clip before downloading',
        ],
      },
      {
        h2: 'Music, podcasts and long mixes',
        paras: [
          'YouTube Music links (music.youtube.com) work the same way, chapters are kept in the metadata job, and long mixes are handled with a configurable timeout so a two-hour set does not fail halfway.',
        ],
      },
    ],
    faqs: [
      { q: 'Is 320 kbps really available?', a: 'Yes, when the source has a high enough audio stream. The app converts to 320 kbps MP3 with ffmpeg and reports the real resulting bitrate.' },
      { q: 'Can I download only a part of the audio?', a: 'Yes — set a trim range (for example 00:30 → 01:15) in the Audio tab and only that portion is converted.' },
      { q: 'Does it work for YouTube Music links?', a: 'Yes, music.youtube.com links are recognised and treated like normal video links.' },
      { q: 'Will the audio have a watermark or voice-over?', a: 'Never. The file is the audio stream from the original video, converted to your chosen format.' },
      { q: 'Can I convert a whole playlist to MP3?', a: 'Yes — use the playlist/batch button and you get every track, packed into one ZIP archive.' },
    ],
    related: ['/youtube-video-downloader', '/youtube-playlist-downloader', '/youtube-to-mp4', '/youtube-subtitle-downloader'],
  }),

  page({
    slug: '/youtube-playlist-downloader',
    title: 'YouTube Playlist Downloader — One ZIP, All Videos (Free)',
    description:
      'Download a whole YouTube playlist in one click. Every item is queued individually with live status and packed into a single ZIP archive. Playlists as MP4 or MP3, no ads.',
    h1: 'YouTube Playlist Downloader (ZIP)',
    keywords: ['youtube playlist downloader', 'download youtube playlist', 'playlist to zip', 'bulk youtube download'],
    intro:
      'Paste a playlist link and the app reads every item, queues the downloads you asked for and packs the finished files into one ZIP archive — with a per-item status list so you always know what succeeded, what is still running and what was skipped.',
    sections: [
      {
        h2: 'How playlist downloads work here',
        paras: [
          'Playlists are turned into individual jobs rather than one giant download. Each item reports its own progress, failures do not kill the whole batch, and the ZIP is generated only when the work is finished — so you never download a half-empty archive.',
        ],
        bullets: [
          'Per-item status: queued, downloading, ready, failed, skipped',
          'Continue working while the batch runs — progress is live',
          'Choose the same preset for the whole playlist (MP4 720p, MP3 320, …)',
          'A note tells you when a limit trimmed the batch instead of failing silently',
        ],
      },
      {
        h2: 'Playlists, albums and course series',
        paras: [
          'Music albums, lecture series, tutorial playlists and language courses all work. Items you do not want can simply be ignored — you can also paste several links and use the URL extractor to queue only the parts you need.',
        ],
      },
      {
        h2: 'Limits you should know about',
        table: {
          head: ['Setting', 'Default', 'Why'],
          rows: [
            ['Items per batch', '5', 'Keeps the queue fair for everyone (configurable)'],
            ['Playlist items read', '50', 'Protects memory on huge playlists'],
            ['Concurrent jobs', '2', 'YouTube throttles aggressive parallel downloads'],
            ['File lifetime', '6 hours', 'Downloads are removed automatically after they expire'],
          ],
        },
      },
    ],
    faqs: [
      { q: 'Can I download a playlist as MP3?', a: 'Yes. Choose an audio preset (MP3 320 kbps, M4A, OPUS, FLAC) before starting the batch and the ZIP will contain audio files.' },
      { q: 'Why were some items skipped?', a: 'The batch size limit (default 5, configurable by the server owner) trims very large playlists. The batch note lists exactly which items were skipped so you can run a second batch.' },
      { q: 'Does a private or deleted video break the batch?', a: 'No. That item is marked failed with a typed error and the rest of the playlist continues.' },
      { q: 'How do I download only certain videos from a playlist?', a: 'Paste the playlist link, then use the URL extractor to copy individual video links, or simply queue the ones you want with their own links.' },
      { q: 'Is there a limit on playlist size?', a: 'The server owner can configure both the number of playlist items read and the batch size; the defaults are 50 and 5.' },
    ],
    related: ['/youtube-video-downloader', '/youtube-mp3-downloader', '/youtube-to-mp4', '/free-youtube-downloader-no-ads'],
  }),

  page({
    slug: '/youtube-shorts-downloader',
    title: 'YouTube Shorts Downloader — Save Shorts Without Watermark',
    description:
      'Download YouTube Shorts as MP4 in the original quality (1080×1920 vertical), without a watermark, without ads and without installing an app. Paste the Shorts link and go.',
    h1: 'YouTube Shorts Downloader',
    keywords: ['youtube shorts downloader', 'download shorts', 'shorts video download', 'no watermark shorts'],
    intro:
      'Shorts are normal videos with a vertical frame, so they download exactly like everything else — full quality MP4, original vertical resolution, no watermark, no app install, no ads.',
    sections: [
      {
        h2: 'How to save a Short in three steps',
        paras: [
          'Open the Short in the YouTube app, tap Share → Copy link, then paste it here and press Analyse. Pick the quality (1080p vertical is usually the highest) and download. On desktop you can also copy the /shorts/ URL from the address bar — both link shapes are understood.',
        ],
        bullets: [
          'Vertical 1080×1920, 720×1280 and lower resolutions are listed',
          'Audio-only extraction works too if you only want the sound',
          'No watermark is added by this app — you get the stream YouTube serves',
        ],
      },
      {
        h2: 'Re-uploading Shorts? Read this first',
        paras: [
          'Downloading and re-uploading someone else’s Short is copyright infringement and YouTube’s Content ID will find it. Use this tool for your own uploads, for content licensed for reuse, or for private offline viewing — not to repost other creators’ work as your own.',
        ],
      },
    ],
    faqs: [
      { q: 'Does it remove the YouTube watermark?', a: 'This app does not add any watermark and it downloads the stream YouTube serves. Shorts do not carry a burned-in watermark on the video stream itself.' },
      { q: 'Can I download Shorts on an iPhone?', a: 'Yes — it works in Safari and Chrome on iOS. Save the file to the Files app or Photos, and add the site to your Home Screen for one-tap access.' },
      { q: 'Which quality should I pick for Shorts?', a: '1080×1920 if it is available (it is the native frame for most Shorts). Lower resolutions exist for shorter uploads.' },
      { q: 'Can I download many Shorts at once?', a: 'Yes, if they belong to a playlist or you paste several links — the batch feature queues them and packs the results into one ZIP.' },
      { q: 'Is downloading Shorts allowed?', a: 'Only for videos you own, videos licensed for reuse, or uses your local law allows. Reposting someone else’s Short is not allowed.' },
    ],
    related: ['/youtube-video-downloader', '/youtube-mp3-downloader', '/youtube-downloader-for-android', '/free-youtube-downloader-no-ads'],
  }),

  page({
    slug: '/youtube-4k-downloader',
    title: 'YouTube 4K & 8K Downloader — With Audio Merged (Free)',
    description:
      'Download YouTube videos in 4K (2160p), 8K (4320p) or 1440p as MP4 — video and audio streams merged with ffmpeg so the file is not silent. See real sizes and codecs before you download.',
    h1: 'YouTube 4K / 8K Downloader',
    keywords: ['youtube 4k downloader', 'download youtube 4k', 'youtube 8k download', '1440p downloader'],
    intro:
      'High resolutions on YouTube are split into a video-only stream and an audio-only stream. This downloader fetches both and merges them with ffmpeg, so your 4K file plays with sound in every player.',
    sections: [
      {
        h2: 'The silent-video problem, explained',
        paras: [
          'Above 720p YouTube uses adaptive streams: video and audio travel separately. A downloader that saves only the video stream gives you a beautiful, completely silent 4K file — the single most common complaint about other tools. Merging with ffmpeg (-c copy) fixes it without re-encoding, so it is fast and lossless.',
        ],
        bullets: [
          'The format table flags every stream that needs a merge',
          'The merge is verified in the automated test-suite',
          'Codec is shown (H.264, VP9, AV1) so you know what your TV can play',
        ],
      },
      {
        h2: 'Which quality should you pick?',
        table: {
          head: ['Resolution', 'Data per minute', 'Pick it when'],
          rows: [
            ['8K (4320p)', '~200–400 MB', 'Archival, VR, future-proofing'],
            ['4K (2160p)', '~80–150 MB', 'TV viewing, editing, HDR sources'],
            ['1440p (2K)', '~40–70 MB', 'Monitors, crisp YouTube re-uploads'],
            ['1080p', '~20–40 MB', 'The safe default for everything'],
            ['720p', '~10–20 MB', 'Phones, saving space'],
            ['480p / 360p', '~5–10 MB', 'Slow connections, quick previews'],
          ],
        },
      },
      {
        h2: 'HDR, 60 fps and high-bitrate sources',
        paras: [
          'The catalogue keeps the details that matter: frame rate (60 fps gaming footage stays 60 fps), HDR flags and the video codec. If a video has no 4K, the app says so and offers the highest real resolution instead of failing.',
        ],
      },
    ],
    faqs: [
      { q: 'Why is my 4K download silent on other sites?', a: 'Because they saved only the video stream. YouTube delivers 4K as separate video and audio streams; without an ffmpeg merge you get a silent file.' },
      { q: 'Can I download 8K videos?', a: 'Yes, when the uploader provided an 8K stream (4320p). The format table shows the real maximum for each video.' },
      { q: 'Does merging reduce quality?', a: 'No. The streams are copied (-c copy) into an MP4/MKV container, so there is no re-encoding and no quality loss.' },
      { q: 'Will a 4K file play on my TV or phone?', a: '4K in H.264/VP9 plays on most modern TVs and computers. AV1 needs a recent device — check the codec shown in the table and pick another format if unsure.' },
      { q: 'Why is a 4K download slower?', a: 'It is a large file (often over 1 GB). Progress shows real speed and ETA so you can watch it, and the connection supports resume if it drops.' },
    ],
    related: ['/youtube-video-downloader', '/youtube-to-mp4', '/youtube-video-trimmer', '/youtube-playlist-downloader'],
  }),

  page({
    slug: '/youtube-to-mp4',
    title: 'YouTube to MP4 — Download Videos as MP4 (Any Quality)',
    description:
      'Convert and download YouTube videos as MP4 in 240p to 8K. Video and audio are merged with ffmpeg, subtitles and metadata optional. Free, no ads, no sign-up, works on mobile.',
    h1: 'YouTube to MP4 Converter',
    keywords: ['youtube to mp4', 'convert youtube to mp4', 'youtube mp4 download', 'yt to mp4 1080p'],
    intro:
      'MP4 is the format that plays everywhere — phones, TVs, editors, PowerPoint, WhatsApp. Pick a height (240p to 8K) and the app downloads the matching streams, merges them with ffmpeg and hands you one clean .mp4 file.',
    sections: [
      {
        h2: 'What you get',
        paras: [
          'A single MP4 with a video stream and an audio stream, fast-start enabled so it begins playing immediately (also while it is still downloading in some players). Filenames are taken from the video title, cleaned of characters that break Windows, macOS or Android.',
        ],
        bullets: [
          'Fast-start (moov atom at the front) for instant playback',
          'Sanitised, readable filenames',
          'Optional subtitle file and thumbnail download next to the video',
          'HTTP range support: pause and resume the download in your browser',
        ],
      },
      {
        h2: 'MP4 vs MKV vs WebM',
        table: {
          head: ['Container', 'When it is used'],
          rows: [
            ['MP4', 'Default — widest device support (H.264 + AAC)'],
            ['MKV', 'When the source codec needs a container MP4 cannot hold'],
            ['WebM', 'VP9/AV1 sources intended for browsers'],
          ],
        },
      },
      {
        h2: 'Do you need to convert anything?',
        paras: [
          'Usually not: the streams YouTube serves are already H.264/VP9/AV1 with AAC/Opus audio, so "converting" is really a container merge. That is why it takes seconds instead of the minutes a real transcode would need — and why the quality is identical to the original upload.',
        ],
      },
    ],
    faqs: [
      { q: 'Can I convert YouTube to MP4 on my phone?', a: 'Yes, in the browser on Android or iOS. The finished file lands in your Downloads (Android) or the Files app (iOS).' },
      { q: 'Which MP4 quality should I choose?', a: '1080p is the best all-round choice. Choose 720p for phones and 4K/8K when you have the storage and the screen.' },
      { q: 'Will the MP4 keep subtitles?', a: 'Subtitles are downloaded as a separate .srt file (the standard for players and editors). Select the language in the Subtitles tab before downloading.' },
      { q: 'Why is the file MKV sometimes?', a: 'Some codec combinations cannot be stored in MP4 without re-encoding. In that rare case the app gives you MKV — every modern player opens it.' },
      { q: 'Is there a file size limit?', a: 'The server owner can configure a maximum (4 GB by default, plus a duration limit) to keep the queue healthy.' },
    ],
    related: ['/youtube-4k-downloader', '/youtube-video-downloader', '/youtube-video-trimmer', '/youtube-thumbnail-downloader'],
  }),

  page({
    slug: '/youtube-subtitle-downloader',
    title: 'YouTube Subtitle Downloader — SRT & VTT Captions (Free)',
    description:
      'Download YouTube subtitles and closed captions as .srt in every available language, including auto-generated tracks. Free, no ads, no sign-up, no software to install.',
    h1: 'YouTube Subtitle & Caption Downloader',
    keywords: ['youtube subtitle downloader', 'download youtube captions', 'youtube srt download', 'yt subtitles'],
    intro:
      'Grab the captions of any video as a standard .srt file — manual tracks in every language the uploader provided, plus YouTube’s auto-generated tracks. Perfect for study notes, translation work, accessibility and video editing.',
    sections: [
      {
        h2: 'Manual and auto-generated tracks',
        paras: [
          'The Subtitles tab lists both kinds and marks them: manual tracks are usually more accurate, while auto-generated ones exist for far more videos and languages. Both download as clean .srt with comma decimal timestamps that every player and editor understands.',
        ],
        bullets: [
          'One file per language, named with the video title and language code',
          'VTT preview available in the browser before you download',
          'Works together with a video download — grab both in one visit',
        ],
      },
      {
        h2: 'Typical uses',
        table: {
          head: ['Use case', 'Why SRT helps'],
          rows: [
            ['Studying', 'Read along, search, take notes offline'],
            ['Translation', 'Translate a timed file instead of retyping it'],
            ['Video editing', 'Import as a caption track in any NLE'],
            ['Accessibility', 'Re-publish with accurate captions'],
            ['Podcast show notes', 'Turn the transcript into an article'],
          ],
        },
      },
    ],
    faqs: [
      { q: 'Are subtitles free to download?', a: 'The download is free. Re-using someone else’s captions may still be covered by copyright — check the licence of the video.' },
      { q: 'Do auto-generated subtitles work?', a: 'Yes. They are marked as auto-generated because their accuracy is lower; the timings are still usable.' },
      { q: 'Which formats do I get?', a: '.srt for editors and players, and a WebVTT preview in the browser for the built-in player and web pages.' },
      { q: 'Can I download subtitles without downloading the video?', a: 'Yes — the subtitle job runs on its own and only produces the caption file.' },
      { q: 'What if the video has no subtitles?', a: 'The Subtitles tab stays empty and says so. Auto-generated captions appear only when YouTube has produced them (often the next day for new uploads).' },
    ],
    related: ['/youtube-thumbnail-downloader', '/youtube-to-mp4', '/youtube-mp3-downloader', '/youtube-video-downloader'],
  }),

  page({
    slug: '/youtube-thumbnail-downloader',
    title: 'YouTube Thumbnail Downloader — All Sizes, HD & 4K (Free)',
    description:
      'Download YouTube thumbnails in every size from 120×90 up to 1280×720, including the max-resolution HD version. Free, instant, no ads, no sign-up, no software.',
    h1: 'YouTube Thumbnail Downloader',
    keywords: ['youtube thumbnail downloader', 'download youtube thumbnail', 'yt thumbnail hd', 'maxresdefault download'],
    intro:
      'Every thumbnail size YouTube stores for a video — default, medium, high, standard and max-resolution HD — in one grid. Click to download the JPEG, or open it in a new tab to check the quality first.',
    sections: [
      {
        h2: 'Available sizes',
        table: {
          head: ['Name', 'Resolution', 'Where it is used'],
          rows: [
            ['default', '120×90', 'Tiny previews, favicons'],
            ['mqdefault', '320×180', 'Search results, sidebars'],
            ['hqdefault', '480×360', 'Channel grids, embeds'],
            ['sddefault', '640×480', 'Legacy players'],
            ['maxresdefault', '1280×720', 'HD artwork, if the uploader provided it'],
          ],
        },
      },
      {
        h2: 'For designers, CMS editors and automation',
        paras: [
          'Thumbnails are served through this site (not hot-linked) so they work in editors and scripts, and the same data is available as JSON through the free API — perfect for building a content calendar or a channel archive without scraping the YouTube page.',
        ],
        bullets: [
          'One click per size, correct filename with the video title',
          'No watermark, original JPEG quality',
          'Thumbnail + metadata JSON can be downloaded together',
        ],
      },
    ],
    faqs: [
      { q: 'Can I download a thumbnail in 4K?', a: 'YouTube stores thumbnails up to 1280×720 (maxresdefault). Larger originals exist only in the uploader’s YouTube Studio, so no tool can download what the site does not host.' },
      { q: 'Why is maxresdefault sometimes missing?', a: 'Old uploads or videos where the uploader used a smaller custom image may not have the HD thumbnail; the lower sizes always exist.' },
      { q: 'Is it allowed to use a thumbnail?', a: 'For personal or editorial use with credit, usually yes; using it as your own artwork without permission is not.' },
      { q: 'Can I get thumbnails for a whole playlist?', a: 'Yes — the free API returns thumbnail URLs for each entry, so a short script can fetch them all.' },
      { q: 'Do you store the images?', a: 'Only for the lifetime of a download job; nothing is kept long-term and nothing is tracked.' },
    ],
    related: ['/youtube-subtitle-downloader', '/youtube-to-mp4', '/youtube-video-downloader', '/youtube-playlist-downloader'],
  }),

  page({
    slug: '/youtube-video-trimmer',
    title: 'YouTube Video Trimmer — Cut & Download a Clip (Free)',
    description:
      'Trim any YouTube video before downloading: set a start and end time and get just that clip as MP4 or MP3. No editing software, no ads, no sign-up.',
    h1: 'YouTube Video Trimmer',
    keywords: ['youtube trimmer', 'cut youtube video', 'download part of youtube video', 'youtube clip downloader'],
    intro:
      'Set a start and an end time (for example 00:30 → 01:15) and only that portion is downloaded and converted — ideal for ringtones, quotes, sports moments, lecture snippets and social clips.',
    sections: [
      {
        h2: 'How trimming works',
        paras: [
          'The range is passed to the engine, which downloads the needed part and lets ffmpeg cut it precisely. The result is a normal MP4 (or MP3) that starts exactly where you asked and is named with the word "trim" so you can tell clips apart from full downloads.',
        ],
        bullets: [
          'Precise to the tenth of a second',
          'Works for video and audio presets',
          'Combine with a 720p preset to keep clips small for messaging apps',
        ],
      },
      {
        h2: 'Popular clip recipes',
        table: {
          head: ['Goal', 'Preset', 'Range'],
          rows: [
            ['Ringtone', 'MP3 320 kbps', '00:00 → 00:30'],
            ['Quote for a reel', 'MP4 720p', '01:12 → 01:32'],
            ['Song chorus', 'MP3 192 kbps', '01:05 → 01:50'],
            ['Lecture snippet', 'MP4 1080p', '12:30 → 18:00'],
          ],
        },
      },
    ],
    faqs: [
      { q: 'How long can a clip be?', a: 'Any length up to the video’s duration and the server’s configured maximum duration.' },
      { q: 'Can I trim without downloading the whole video first?', a: 'Yes — that is the point. Only the required portion is fetched and encoded, so a 10-second clip from a 2-hour stream is fast.' },
      { q: 'Does trimming reduce quality?', a: 'The cut is done with ffmpeg; keeping the same codec means no visible quality loss.' },
      { q: 'Can I trim MP3 audio?', a: 'Yes, trimming works in the Audio tab too.' },
      { q: 'Is there a preview of the clip?', a: 'Not yet — the app reports the resulting duration after the job, and the video card shows the full length so you can pick the range.' },
    ],
    related: ['/youtube-mp3-downloader', '/youtube-to-mp4', '/youtube-4k-downloader', '/youtube-video-downloader'],
  }),

  page({
    slug: '/youtube-downloader-for-android',
    title: 'YouTube Downloader for Android — No App, No Ads (Free)',
    description:
      'Download YouTube videos and MP3 on Android straight from the browser. No APK, no ads, no popups — works in Chrome and Firefox, saves to your Downloads folder.',
    h1: 'YouTube Downloader for Android',
    keywords: ['youtube downloader for android', 'android youtube video download', 'download youtube video android mobile', 'yt downloader apk alternative'],
    intro:
      'You do not need an APK or a sketchy third-party app store. Open this site in Chrome, paste the link and download — the file lands in your Downloads folder and plays in any player. Add it to your Home Screen and it behaves like an app.',
    sections: [
      {
        h2: 'Why a web app beats an APK',
        table: {
          head: ['', 'This web app', 'Typical Android APK'],
          rows: [
            ['Install', 'Nothing to install (or one Home Screen shortcut)', 'APK from outside Play Store'],
            ['Updates', 'Always current', 'Manual re-download'],
            ['Permissions', 'None — the browser handles storage', 'Often contacts, storage, phone state'],
            ['Ads', 'None', 'Banner + interstitial ads'],
            ['Source', 'Open source (MIT), self-hostable', 'Closed, sometimes modified'],
          ],
        },
      },
      {
        h2: 'Step by step on Android',
        paras: [
          'In the YouTube app tap Share → Copy link, switch to Chrome, paste the link here and press Analyse. Choose MP4 1080p for watching or MP3 320 kbps for music, press Download, then open the notification or the Files app to find the file. Long-press the page in Chrome → Add to Home Screen to get an icon.',
        ],
        bullets: [
          'Files are saved by Chrome — no storage permission prompts',
          'Progress keeps updating even in a background tab',
          'MP3 for music, MP4 for video, SRT for subtitles',
        ],
      },
    ],
    faqs: [
      { q: 'Do I need to install an APK?', a: 'No. Everything runs in the browser. If you want an icon, use Add to Home Screen — that is a PWA shortcut, not an APK.' },
      { q: 'Where do downloads go on Android?', a: 'Chrome saves them to Downloads; you can open them from the notification, the Downloads app or any file manager.' },
      { q: 'Does it work on older Android versions?', a: 'Yes — any reasonably recent Chrome, Firefox or Samsung Internet build works. The UI is mobile-first and touch-friendly.' },
      { q: 'Can I download in the background?', a: 'Yes, the job runs on the server. Keep the tab open for live progress, or come back later and download from your history.' },
      { q: 'Is it safe?', a: 'There is nothing to install, no ad network, no tracker and no third-party script in the page. You can also self-host your own copy.' },
    ],
    related: ['/youtube-downloader-for-pc', '/youtube-shorts-downloader', '/youtube-mp3-downloader', '/free-youtube-downloader-no-ads'],
  }),

  page({
    slug: '/youtube-downloader-for-pc',
    title: 'YouTube Downloader for PC — Windows, Mac & Linux (Free)',
    description:
      'Download YouTube videos in 4K on Windows, macOS and Linux from the browser — no installer, no bundled toolbars, no ads. Works in Chrome, Edge, Firefox and Safari.',
    h1: 'YouTube Downloader for PC (Windows, macOS, Linux)',
    keywords: ['youtube downloader for pc', 'youtube downloader windows', 'youtube downloader mac', 'download youtube on laptop'],
    intro:
      'No installer, no “download manager” bundle, no toolbar that hijacks your search engine. Open the site on any desktop OS, paste the link, pick a quality and save the file — or self-host it and use it forever.',
    sections: [
      {
        h2: 'Desktop advantages',
        bullets: [
          '4K/8K downloading with real progress and speed',
          'Playlists as one ZIP — unzip on your PC and sort the files',
          'Subtitles as .srt, ready for editing software',
          'Metadata JSON for archiving libraries',
          'Self-host it on your own machine or NAS, then it is always yours',
        ],
      },
      {
        h2: 'Windows, macOS and Linux in one paragraph',
        paras: [
          'Because the whole thing is a web app, nothing is OS-specific: the download happens on the server (or on your own self-hosted instance) and your browser saves the file the usual way — Ctrl+J for the downloads list in Chrome and Edge, Cmd+Shift+J on Safari.',
        ],
      },
      {
        h2: 'Prefer the command line?',
        paras: [
          'There is a documented REST API: POST /api/jobs to create a download, GET /api/events for live progress over SSE, GET /api/files/{id} to fetch the finished file. The OpenAPI 3.0.3 document is served at /api/openapi.json, so you can generate a client for any language in seconds.',
        ],
      },
    ],
    faqs: [
      { q: 'Do I have to install anything on Windows?', a: 'No. It works entirely in the browser. If you want automation, use the free API or self-host the server.' },
      { q: 'Can I download 4K on a laptop?', a: 'Yes, though it is a large file — progress and ETA are shown, and the download supports resume if the connection drops.' },
      { q: 'Which browsers are supported?', a: 'Chrome, Edge, Firefox, Safari and anything Chromium-based; the UI is responsive and keyboard-friendly (press / to focus the link box).' },
      { q: 'Can I self-host it on my own PC?', a: 'Yes — clone the repository, run npm install, npm run setup, npm run build and npm start, then open http://localhost:8080.' },
      { q: 'Is there a desktop app?', a: 'No, and that is deliberate: no installer means no bundled adware. A self-hosted instance plus a Home Screen shortcut gives the same convenience.' },
    ],
    related: ['/youtube-downloader-for-android', '/youtube-4k-downloader', '/youtube-playlist-downloader', '/youtube-video-downloader'],
  }),

  page({
    slug: '/free-youtube-downloader-no-ads',
    title: 'Free YouTube Downloader Without Ads, Popups or Sign-Up',
    description:
      'A YouTube downloader with no ads, no pop-ups, no fake download buttons, no redirects and no account. Open source, self-hostable, and honest about what it does.',
    h1: 'Free YouTube Downloader — No Ads, No Popups, No Sign-Up',
    keywords: ['youtube downloader no ads', 'ad free youtube downloader', 'youtube downloader without popup', 'safe youtube downloader'],
    intro:
      'Every other free downloader pays for its servers with your attention: fake “Download” buttons, pop-unders, five redirects and a CAPTCHA. This one does not, because there is nothing to monetise — no ads, no trackers, no account, and the source is open.',
    sections: [
      {
        h2: 'What “no ads” actually means here',
        table: {
          head: ['Annoyance', 'This site'],
          rows: [
            ['Display / banner ads', 'None'],
            ['Pop-ups and pop-unders', 'None'],
            ['Fake or duplicated download buttons', 'One button per format'],
            ['Redirects to “offers”', 'Never — links point to your file'],
            ['CAPTCHA before download', 'None'],
            ['Account or email required', 'None'],
            ['Third-party trackers / analytics', 'None'],
            ['Clickbait “fast” tiers', 'All qualities are available to everyone'],
          ],
        },
      },
      {
        h2: 'How is it free then?',
        paras: [
          'The project is open source and self-hostable, so the usual business model — sell the visitor’s attention — is not needed. If you use a public instance, the owner pays for a small server or runs it on their own machine; if you self-host, you pay nothing at all and keep complete control.',
        ],
      },
      {
        h2: 'Honest limitations',
        paras: [
          'It is a tool, not a magic wand. YouTube can rate-limit datacenter IPs, so a public instance occasionally returns a “bot check” error until the owner adds a proxy or cookies. Very long playlists are trimmed by the configured batch size. And it cannot download what YouTube makes unavailable — private videos, for instance, simply fail with a clear error message.',
        ],
      },
    ],
    faqs: [
      { q: 'Is this site really ad-free?', a: 'Yes — there is no ad network, no analytics and no third-party script in the page. If you self-host it, you can verify that in the source code.' },
      { q: 'Do I need to create an account?', a: 'No. There is no sign-up, no email, no phone number and nothing to verify.' },
      { q: 'How do you make money?', a: 'The project does not. It is MIT-licensed open-source software; public instances are usually paid for by their owners.' },
      { q: 'Is it safe to use?', a: 'There is nothing to install, no tracker and no third party. You can also host your own copy, in which case no one but you handles the download.' },
      { q: 'Can I run it myself?', a: 'Yes — the repository ships with Docker and one-command setup. Self-hosting is documented in detail.' },
    ],
    related: ['/youtube-video-downloader', '/youtube-downloader-for-pc', '/youtube-downloader-for-android', '/youtube-playlist-downloader'],
  }),

  page({
    slug: '/youtube-video-downloader-hindi',
    lang: 'hi',
    title: 'YouTube वीडियो डाउनलोडर — 4K, 1080p और MP3 मुफ़्त (No Ads)',
    description:
      'मुफ़्त YouTube वीडियो डाउनलोडर: 4K, 1080p, 720p MP4 (आवाज़ के साथ) या MP3 320 kbps डाउनलोड करें। कोई विज्ञापन नहीं, कोई पॉपअप नहीं, कोई साइन-अप नहीं।',
    h1: 'YouTube वीडियो डाउनलोडर (हिन्दी)',
    keywords: ['youtube video download kaise kare', 'youtube video downloader hindi', 'video download hindi', 'यूट्यूब वीडियो डाउनलोड'],
    intro:
      'कोई भी YouTube वीडियो, Shorts, म्यूज़िक या प्लेलिस्ट का लिंक पेस्ट करें और असली फ़ाइल डाउनलोड करें — MP4 में 8K से 240p तक, या सिर्फ़ आवाज़ MP3 320 kbps में। सब मुफ़्त, बिना विज्ञापन, बिना पॉपअप, बिना साइन-अप।',
    sections: [
      {
        h2: 'कैसे डाउनलोड करें (4 आसान स्टेप)',
        paras: [
          'YouTube ऐप में वीडियो खोलें → Share → Copy link दबाएँ (कंप्यूटर पर address bar से लिंक कॉपी करें) → ऊपर दिए बॉक्स में पेस्ट करें → Analyse दबाएँ → क्वालिटी चुनें → Download दबाएँ और फ़ाइल सेव करें।',
        ],
        bullets: [
          'डाउनलोड की प्रोग्रेस लाइव दिखती है — प्रतिशत, स्पीड और बचा हुआ समय',
          'हाई क्वालिटी (1080p, 4K) में वीडियो और आवाज़ अलग-अलग स्ट्रीम से जोड़ी जाती है, इसलिए फ़ाइल में आवाज़ आती है',
          'पूरी प्लेलिस्ट एक ZIP फ़ाइल में मिलती है',
          'सबटाइटल (.srt), थंबनेल और सिर्फ़ ऑडियो (MP3/M4A/OPUS/FLAC) भी डाउनलोड हो सकते हैं',
        ],
      },
      {
        h2: 'मोबाइल पर कैसे चलता है?',
        paras: [
          'यह एक वेब ऐप है — कुछ इंस्टॉल करने की ज़रूरत नहीं। Android के Chrome या iPhone के Safari में खोलें, लिंक पेस्ट करें और डाउनलोड करें। फ़ाइल Android में Downloads फ़ोल्डर में और iPhone में Files ऐप में सेव होती है। होम स्क्रीन पर ऐप की तरह भी जोड़ सकते हैं।',
        ],
      },
      {
        h2: 'कौन सा फ़ॉर्मैट चुनें?',
        table: {
          head: ['ज़रूरत', 'फ़ॉर्मैट', 'क्वालिटी'],
          rows: [
            ['आम देखने के लिए', 'MP4', '1080p या 720p'],
            ['टीवी या एडिटिंग', 'MP4', '4K / 1440p'],
            ['गाने / पॉडकास्ट', 'MP3', '320 kbps'],
            ['iPhone के लिए', 'M4A', '192 kbps'],
            ['सबटाइटल', 'SRT', 'सभी भाषाएँ'],
            ['सिर्फ़ थंबनेल', 'JPEG', '1280×720 तक'],
          ],
        },
      },
      {
        h2: 'क्या यह क़ानूनी है?',
        paras: [
          'सिर्फ़ वही वीडियो डाउनलोड करें जो आपके हैं, जो Creative Commons जैसे लाइसेंस में हैं, या जिन्हें डाउनलोड करने की आपको अनुमति है। YouTube की शर्तें और अपने देश का कॉपीराइट क़ानून मानें। किसी और का वीडियो दोबारा अपलोड करना उल्लंघन है।',
        ],
      },
    ],
    faqs: [
      { q: 'क्या यह पूरी तरह मुफ़्त है?', a: 'हाँ — कोई अकाउंट नहीं, कोई पेमेंट नहीं, कोई प्रीमियम नहीं। कोड ओपन सोर्स (MIT) है, इसलिए इसे बंद या पेड नहीं किया जा सकता।' },
      { q: '1080p डाउनलोड में आवाज़ क्यों नहीं आती (दूसरी साइट्स पर)?', a: 'क्योंकि YouTube 1080p और ऊपर की क्वालिटी अलग-अलग वीडियो और ऑडियो स्ट्रीम में देता है। जिन साइट्स के सर्वर पर ffmpeg नहीं होता वे सिर्फ़ वीडियो सेव कर लेते हैं और फ़ाइल बिना आवाज़ की बनती है — यहाँ दोनों स्ट्रीम जोड़ी जाती हैं।' },
      { q: 'क्या MP3 में गाने डाउनलोड हो सकते हैं?', a: 'हाँ, MP3 320/192/128 kbps, M4A, OPUS, WAV और FLAC — Audio टैब में चुनें।' },
      { q: 'प्लेलिस्ट डाउनलोड कर सकते हैं?', a: 'हाँ, पूरी प्लेलिस्ट एक ZIP फ़ाइल में मिलती है, हर आइटम की स्थिति अलग दिखती है।' },
      { q: 'क्या मेरी जानकारी सेव होती है?', a: 'नहीं। कोई विज्ञापन, कोई ट्रैकर नहीं। फ़ाइलें समय पूरा होने पर अपने-आप हट जाती हैं और सर्वर सिर्फ़ एक अनाम per-IP रेट लिमिट गिनता है।' },
    ],
    related: ['/youtube-video-downloader', '/youtube-mp3-downloader', '/youtube-downloader-for-android', '/youtube-playlist-downloader'],
  }),
];

/** Fast lookup by slug (always leading slash, no trailing slash). */
const bySlug = new Map(SEO_PAGES.map((entry) => [entry.slug, entry]));

export function seoPage(slug) {
  const normalised = normaliseSlug(slug);
  return bySlug.get(normalised) ?? null;
}

export function normaliseSlug(slug) {
  if (!slug) return HOME;
  const trimmed = String(slug).split('?')[0].split('#')[0];
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withSlash.length > 1 && withSlash.endsWith('/') ? withSlash.slice(0, -1) : withSlash;
}

/** Every crawlable route: the marketing pages plus the app's own pages. */
export function crawlableSlugs() {
  return [HOME, ...SEO_PAGES.map((p) => p.slug), '/how-to', '/faq', '/api-docs', '/privacy', '/terms'];
}

export function relatedPages(page) {
  return (page.related ?? []).map((slug) => bySlug.get(slug)).filter(Boolean);
}

/** Plain-text version of a page (used by the sitemap test and for parity checks). */
export function pageText(page) {
  const parts = [page.h1, page.intro];
  for (const section of page.sections) {
    parts.push(section.h2 ?? '');
    parts.push(...(section.paras ?? []));
    parts.push(...(section.bullets ?? []));
    if (section.table) {
      parts.push(section.table.head.join(' '));
      for (const row of section.table.rows) parts.push(row.join(' '));
    }
  }
  for (const faq of page.faqs) parts.push(faq.q, faq.a);
  return parts.join('\n');
}
