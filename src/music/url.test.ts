import { describe, it, expect } from 'vitest';
import { isPossibleUrl, validateAndNormalizeUrl } from './url.js';

describe('URL Detection, Normalization & Allowlist Validation', () => {
  describe('isPossibleUrl', () => {
    it('identifies http/https URLs', () => {
      expect(isPossibleUrl('https://www.youtube.com/watch?v=123')).toBe(true);
      expect(isPossibleUrl('http://open.spotify.com/track/abc')).toBe(true);
    });

    it('identifies URLs without protocol prefixes', () => {
      expect(isPossibleUrl('youtube.com/watch?v=123')).toBe(true);
      expect(isPossibleUrl('open.spotify.com/track/abc')).toBe(true);
      expect(isPossibleUrl('soundcloud.com/artist/track')).toBe(true);
    });

    it('returns false for plain-text search terms', () => {
      expect(isPossibleUrl('never gonna give you up')).toBe(false);
      expect(isPossibleUrl('daft punk get lucky')).toBe(false);
      expect(isPossibleUrl('queen bohemian rhapsody')).toBe(false);
    });
  });

  describe('YouTube & YouTube Music URLs', () => {
    it('normalizes standard watch URL and strips tracking parameters', () => {
      const res = validateAndNormalizeUrl(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=tracking123&feature=shared&utm_source=twitter',
      );
      expect(res.isValid).toBe(true);
      expect(res.validated?.sourceType).toBe('youtube');
      expect(res.validated?.isPlaylist).toBe(false);
      expect(res.validated?.canonicalUrl).toBe(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      );
    });

    it('normalizes youtu.be short links into canonical watch URLs', () => {
      const res = validateAndNormalizeUrl('https://youtu.be/dQw4w9WgXcQ?si=abcxyz');
      expect(res.isValid).toBe(true);
      expect(res.validated?.sourceType).toBe('youtube');
      expect(res.validated?.canonicalUrl).toBe(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      );
    });

    it('normalizes YouTube Shorts into canonical watch URLs', () => {
      const res = validateAndNormalizeUrl('https://www.youtube.com/shorts/5qap5aO4i9A');
      expect(res.isValid).toBe(true);
      expect(res.validated?.sourceType).toBe('youtube');
      expect(res.validated?.canonicalUrl).toBe(
        'https://www.youtube.com/watch?v=5qap5aO4i9A',
      );
    });

    it('handles YouTube Music links cleanly', () => {
      const res = validateAndNormalizeUrl(
        'https://music.youtube.com/watch?v=dQw4w9WgXcQ&si=123',
      );
      expect(res.isValid).toBe(true);
      expect(res.validated?.sourceType).toBe('youtube');
      expect(res.validated?.canonicalUrl).toBe(
        'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
      );
    });

    it('identifies YouTube playlists', () => {
      const res = validateAndNormalizeUrl(
        'https://www.youtube.com/playlist?list=PLrAlrXzE938D_Y5vA4jZ3eJ4P-G8_yV8j&si=abc',
      );
      expect(res.isValid).toBe(true);
      expect(res.validated?.sourceType).toBe('youtube');
      expect(res.validated?.isPlaylist).toBe(true);
      expect(res.validated?.canonicalUrl).toBe(
        'https://www.youtube.com/playlist?list=PLrAlrXzE938D_Y5vA4jZ3eJ4P-G8_yV8j',
      );
    });

    it('identifies radio/mix playlists', () => {
      const res = validateAndNormalizeUrl(
        'https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ',
      );
      expect(res.isValid).toBe(true);
      expect(res.validated?.sourceType).toBe('youtube');
      expect(res.validated?.canonicalUrl).toContain('list=RDdQw4w9WgXcQ');
    });
  });

  describe('Spotify URLs', () => {
    it('normalizes standard track URL and strips tracking parameters', () => {
      const res = validateAndNormalizeUrl(
        'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=4265437887ac48da&context=spotify%3Aplaylist%3A37i9dQZF1DXcBWIGoYBM5M',
      );
      expect(res.isValid).toBe(true);
      expect(res.validated?.sourceType).toBe('spotify');
      expect(res.validated?.isPlaylist).toBe(false);
      expect(res.validated?.canonicalUrl).toBe(
        'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
      );
    });

    it('strips locale prefixes like /intl-fr/ and /intl-es/', () => {
      const resFr = validateAndNormalizeUrl(
        'https://open.spotify.com/intl-fr/track/4cOdK2wGLETKBW3PvgPWqT?si=abc',
      );
      expect(resFr.isValid).toBe(true);
      expect(resFr.validated?.canonicalUrl).toBe(
        'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
      );

      const resEs = validateAndNormalizeUrl(
        'https://open.spotify.com/intl-es/album/1DFixLWuPkv3KT3TnV35m3',
      );
      expect(resEs.isValid).toBe(true);
      expect(resEs.validated?.isPlaylist).toBe(true);
      expect(resEs.validated?.canonicalUrl).toBe(
        'https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3',
      );
    });

    it('strips regional locale prefixes like /intl-pt-br/', () => {
      const res = validateAndNormalizeUrl(
        'https://open.spotify.com/intl-pt-br/playlist/37i9dQZF1DXcBWIGoYBM5M',
      );
      expect(res.isValid).toBe(true);
      expect(res.validated?.isPlaylist).toBe(true);
      expect(res.validated?.canonicalUrl).toBe(
        'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
      );
    });

    it('accepts spotify.link short links', () => {
      const res = validateAndNormalizeUrl('https://spotify.link/xVbY123');
      expect(res.isValid).toBe(true);
      expect(res.validated?.sourceType).toBe('spotify');
    });
  });

  describe('SoundCloud URLs', () => {
    it('normalizes track URL and strips tracking parameters', () => {
      const res = validateAndNormalizeUrl(
        'https://soundcloud.com/nocopyrightsounds/cartoon-on-on-feat-daniel-levi-ncs-release?si=abc&utm_source=clipboard',
      );
      expect(res.isValid).toBe(true);
      expect(res.validated?.sourceType).toBe('soundcloud');
      expect(res.validated?.isPlaylist).toBe(false);
      expect(res.validated?.canonicalUrl).toBe(
        'https://soundcloud.com/nocopyrightsounds/cartoon-on-on-feat-daniel-levi-ncs-release',
      );
    });

    it('identifies SoundCloud sets/playlists', () => {
      const res = validateAndNormalizeUrl(
        'https://soundcloud.com/artist/sets/electronic-mix',
      );
      expect(res.isValid).toBe(true);
      expect(res.validated?.sourceType).toBe('soundcloud');
      expect(res.validated?.isPlaylist).toBe(true);
    });
  });

  describe('Apple Music URLs', () => {
    it('normalizes Apple Music track and album URLs', () => {
      const res = validateAndNormalizeUrl(
        'https://music.apple.com/us/album/get-lucky-feat-pharrell-williams-nile-rodgers/617154241?i=617154366&l=en&uo=4',
      );
      expect(res.isValid).toBe(true);
      expect(res.validated?.sourceType).toBe('applemusic');
      expect(res.validated?.canonicalUrl).not.toContain('uo=4');
      expect(res.validated?.canonicalUrl).not.toContain('l=en');
    });
  });

  describe('Direct Audio URLs', () => {
    it('accepts supported audio file extensions and strips tracking', () => {
      const extensions = ['mp3', 'ogg', 'flac', 'wav', 'aac', 'm4a', 'opus'];

      for (const ext of extensions) {
        const res = validateAndNormalizeUrl(
          `https://files.freemusicarchive.org/track.${ext}?utm_source=twitter`,
        );
        expect(res.isValid).toBe(true);
        expect(res.validated?.sourceType).toBe('direct_audio');
        expect(res.validated?.canonicalUrl).toBe(
          `https://files.freemusicarchive.org/track.${ext}`,
        );
      }
    });
  });

  describe('Allowlist Rejection & Malformed URLs', () => {
    it('rejects disallowed domains with a clear message', () => {
      const disallowed = [
        'https://facebook.com/video/12345',
        'https://tiktok.com/@user/video/12345',
        'https://instagram.com/reel/12345',
        'https://malicious-phishing.xyz/stream.php',
        'https://vimeo.com/123456',
      ];

      for (const url of disallowed) {
        const res = validateAndNormalizeUrl(url);
        expect(res.isValid).toBe(false);
        expect(res.isUrl).toBe(true);
        expect(res.errorMessage).toMatch(/Unsupported URL/i);
      }
    });

    it('handles malformed protocol input', () => {
      const res = validateAndNormalizeUrl('ftp://invalid-server.com/audio.mp3');
      expect(res.isValid).toBe(false);
      expect(res.errorMessage).toMatch(/Only HTTP and HTTPS/i);
    });
  });
});

