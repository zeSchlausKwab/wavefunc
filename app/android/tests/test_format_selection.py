import unittest

from wavefunc_download import select_tracks


def stream(vcodec, acodec, height=None, **extra):
    return {"vcodec": vcodec, "acodec": acodec, "height": height, **extra}


class FormatSelectionTest(unittest.TestCase):
    def setUp(self):
        self.audio = stream("none", "mp4a.40.2")
        self.combined = stream("avc1", "mp4a.40.2", 360)
        self.silent = stream("avc1", "none", 720)

    def test_adaptive_video_requires_matching_audio(self):
        self.assertEqual(select_tracks([self.combined, self.silent], "720p"), [self.combined])
        formats = [self.audio, self.combined, self.silent]
        self.assertEqual(select_tracks(formats, "720p"), [self.silent, self.audio])
        self.assertEqual(select_tracks(formats, "480p"), [self.combined])

    def test_prefers_combined_at_same_resolution(self):
        combined_hd = stream("avc1", "mp4a.40.2", 720)
        self.assertEqual(select_tracks([self.audio, combined_hd, self.silent], "720p"), [combined_hd])

    def test_audio_can_be_extracted_from_combined_track(self):
        self.assertEqual(select_tracks([self.combined], "audio"), [self.combined])
        self.assertEqual(select_tracks([self.audio, self.combined], "audio"), [self.audio])

    def test_returns_no_tracks_if_no_usable_format(self):
        formats = [stream("vp09", "opus", 360), stream(None, None),
                   stream("avc1", "mp4a.40.2", 360, has_drm=True)]
        self.assertEqual(select_tracks(formats, "audio"), [])
        self.assertEqual(select_tracks(formats + [self.silent], "360p"), [])
        self.assertEqual(select_tracks([self.silent], "720p"), [])
