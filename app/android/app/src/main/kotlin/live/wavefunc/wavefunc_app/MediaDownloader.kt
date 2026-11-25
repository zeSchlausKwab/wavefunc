package live.wavefunc.wavefunc_app

import android.content.Context
import com.chaquo.python.Python
import com.chaquo.python.android.AndroidPlatform
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugin.common.StandardMethodCodec
import java.io.File

internal fun registerMediaDownloader(context: Context, messenger: BinaryMessenger) {
    val channel = MethodChannel(
        messenger, "live.wavefunc.app/media", StandardMethodCodec.INSTANCE,
        messenger.makeBackgroundTaskQueue(),
    )
    channel.setMethodCallHandler { call, result ->
        if (call.method != "prepareDownload") {
            result.notImplemented()
            return@setMethodCallHandler
        }
        try {
            val videoId = requireNotNull(call.argument<String>("videoId"))
            val format = requireNotNull(call.argument<String>("format"))
            val directory = File(requireNotNull(call.argument<String>("directory"))).canonicalFile
            require(Regex("[a-zA-Z0-9_-]{11}").matches(videoId)) { "Invalid YouTube video ID." }
            require(format in setOf("audio", "360p", "480p", "720p")) { "Unsupported media format." }
            require(directory.path.startsWith(context.cacheDir.canonicalPath + File.separator)
                    && directory.isDirectory && directory.list()?.isEmpty() == true) {
                "Media download requires a new private cache directory."
            }
            synchronized(Python::class.java) {
                if (!Python.isStarted()) Python.start(AndroidPlatform(context))
            }
            val quickjs = File(context.applicationInfo.nativeLibraryDir, "libwavefunc_qjs.so")
            val files = Python.getInstance().getModule("wavefunc_download")
                .callAttr("download", videoId, format, directory.path, quickjs.path)
                .asList().map { File(it.toString()).canonicalFile }
            require(files.isNotEmpty() && files.all { it.parentFile == directory && it.isFile }) {
                "The downloader produced no usable media files."
            }
            val isAudio = format == "audio"
            writeMp4(files, File(directory, if (isAudio) "media.m4a" else "media.mp4"), isAudio)
            files.forEach { it.delete() }
            result.success(null)
        } catch (e: Exception) {
            result.error("DOWNLOAD_FAILED", e.message ?: "Local media download failed.", null)
        }
    }
}
