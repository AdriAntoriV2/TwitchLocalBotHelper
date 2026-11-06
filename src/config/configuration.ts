export default () => {
  const configuredPort = Number(process.env.PORT ?? 3000);
  const redirectUri =
    process.env.TWITCH_REDIRECT_URI ??
    `http://localhost:${configuredPort}/api/twitch/oauth/callback`;
  const callbackUrl = new URL(redirectUri);
  const isLoopback =
    callbackUrl.hostname === 'localhost' ||
    callbackUrl.hostname === '127.0.0.1' ||
    callbackUrl.hostname === '::1';
  const callbackPort = Number(
    callbackUrl.port || (callbackUrl.protocol === 'https:' ? 443 : 80),
  );
  const port =
    isLoopback && callbackPort !== configuredPort
      ? callbackPort
      : configuredPort;

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',

    server: {
      port,
    },

    database: {
      url: process.env.DATABASE_URL,
    },

    /*
  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },
  */

    session: {
      secret: process.env.SESSION_SECRET,
      cookieSecure: process.env.NODE_ENV === 'production',
    },

    twitch: {
      clientId: process.env.TWITCH_CLIENT_ID,
      clientSecret: process.env.TWITCH_CLIENT_SECRET,
      redirectUri,
      tokenEncryptionKey: process.env.TWITCH_TOKEN_ENCRYPTION_KEY,
      scopes: [
        'user:read:chat',
        'user:write:chat',
        'moderator:read:followers',
        'channel:read:subscriptions',
        'bits:read',
        'channel:read:redemptions',
      ],
      adminUserId: process.env.TWITCH_ADMIN_USER_ID,
    },

    songRequest: {
      queueLimit: Number(process.env.SONG_REQUEST_QUEUE_LIMIT ?? 10),
    },

    playback: {
      mpvPath: process.env.MPV_PATH ?? 'mpv',
      ytDlpPath: process.env.YT_DLP_PATH ?? './yt-dlp.exe',
      ytDlpResolveTimeoutMs: Number(
        process.env.YT_DLP_RESOLVE_TIMEOUT_MS ?? 30_000,
      ),
      ipcPath:
        process.env.MPV_IPC_PATH ??
        (process.platform === 'win32'
          ? '\\\\.\\pipe\\streamops-mpv'
          : '/tmp/streamops-mpv.sock'),
      radioUrl: process.env.RADIO_URL,
    },

    chatOverlay: {
      maxMessages: Number(process.env.CHAT_OVERLAY_MAX_MESSAGES ?? 30),
      messageTtlSeconds: Number(
        process.env.CHAT_OVERLAY_MESSAGE_TTL_SECONDS ?? 3600,
      ),
    },
  };
};
