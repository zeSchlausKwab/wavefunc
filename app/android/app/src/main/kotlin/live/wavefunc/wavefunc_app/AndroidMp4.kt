package live.wavefunc.wavefunc_app

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import java.io.File
import java.nio.ByteBuffer

/** Remux a combined stream or separate adaptive streams without transcoding. */
internal fun writeMp4(files: List<File>, output: File, audioOnly: Boolean) {
    val extractors = mutableListOf<MediaExtractor>()
    val muxer = MediaMuxer(output.path, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    try {
        val destinations = mutableMapOf<Pair<MediaExtractor, Int>, Int>()
        var audio = false
        var video = false
        var bufferSize = 1024 * 1024
        for (file in files) {
            val input = MediaExtractor()
            extractors.add(input)
            input.setDataSource(file.path)
            for (index in 0 until input.trackCount) {
                val format = input.getTrackFormat(index)
                when (format.getString(MediaFormat.KEY_MIME)) {
                    "audio/mp4a-latm" -> if (!audio) audio = true else continue
                    "video/avc" -> if (!video && !audioOnly) video = true else continue
                    else -> continue
                }
                destinations[input to index] = muxer.addTrack(format)
                input.selectTrack(index)
                if (format.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) {
                    bufferSize = maxOf(bufferSize, format.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE))
                }
            }
        }
        require(audio && (audioOnly || video)) { "The downloaded media is missing a required track." }
        val buffer = ByteBuffer.allocateDirect(bufferSize)
        val info = MediaCodec.BufferInfo()
        muxer.start()
        while (true) {
            val input = extractors.filter { it.sampleTrackIndex >= 0 }.minByOrNull { it.sampleTime } ?: break
            val track = destinations.getValue(input to input.sampleTrackIndex)
            buffer.clear()
            val size = input.readSampleData(buffer, 0)
            check(size >= 0) { "Could not read downloaded media." }
            val flags = if (input.sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC != 0)
                MediaCodec.BUFFER_FLAG_KEY_FRAME else 0
            info.set(0, size, input.sampleTime, flags)
            muxer.writeSampleData(track, buffer, info)
            input.advance()
        }
        muxer.stop()
    } finally {
        extractors.forEach { it.release() }
        muxer.release()
    }
}
