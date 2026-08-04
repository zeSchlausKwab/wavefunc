package live.wavefunc.media

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.util.Base64
import android.util.Log
import android.webkit.MimeTypeMap
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.yausername.ffmpeg.FFmpeg
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

@InvokeArg
class PrepareArgs {
    lateinit var videoId: String
    var format: String = "audio"
    lateinit var jobId: String
}

@InvokeArg
class UploadArgs {
    lateinit var jobId: String
    lateinit var blossomUrl: String
    lateinit var signedAuthEvent: String
}

@InvokeArg
class JobIdArgs {
    lateinit var jobId: String
}

private data class MediaJob(
    val directory: File,
    val file: File,
    val sha256: String,
    val size: Long,
    val mimeType: String,
)

@TauriPlugin
class WavefuncMediaPlugin(private val activity: Activity) : Plugin(activity) {
    private val executor = Executors.newSingleThreadExecutor()
    private val jobs = ConcurrentHashMap<String, MediaJob>()
    private val preparingJobs = ConcurrentHashMap.newKeySet<String>()
    private val preparationErrors = ConcurrentHashMap<String, String>()
    private var runtimeUpdateChecked = false

    @Command
    fun prepare(invoke: Invoke) {
        val args = invoke.parseArgs(PrepareArgs::class.java)
        if (!args.videoId.matches(Regex("^[A-Za-z0-9_-]{11}$"))) {
            invoke.reject("Invalid YouTube video ID.")
            return
        }
        if (args.format !in setOf("audio", "360p", "480p", "720p")) {
            invoke.reject("Unsupported media format.")
            return
        }
        if (!isValidJobId(args.jobId)) {
            invoke.reject("Invalid media job ID.")
            return
        }
        if (jobs.containsKey(args.jobId) || !preparingJobs.add(args.jobId)) {
            invoke.reject("This media job is already running.")
            return
        }

        startTransferService()
        executor.execute {
            val jobId = args.jobId
            val directory = File(activity.cacheDir, "media-jobs/$jobId")
            var keepAliveForUpload = false
            try {
                directory.mkdirs()
                YoutubeDL.init(activity.applicationContext)
                FFmpeg.init(activity.applicationContext)
                val refreshedBeforeDownload = refreshYtDlpIfNeeded()

                fun executeDownload() {
                    val request = YoutubeDLRequest(
                        "https://www.youtube.com/watch?v=${args.videoId}",
                    ).apply {
                        addOption("--no-playlist")
                        addOption("--no-warnings")
                        addOption("--newline")
                        addOption("--output", File(directory, "media.%(ext)s").absolutePath)
                        addOption("--format", formatSelector(args.format))
                    }

                    YoutubeDL.execute(request, jobId) { progress, _, text ->
                        val event = JSObject()
                        event.put("stage", "downloading")
                        event.put("progress", progress.toDouble())
                        event.put("message", text.trim().take(240))
                        trigger("progress", event)
                    }
                }

                try {
                    executeDownload()
                } catch (error: Exception) {
                    // yt-dlp playback URLs can stop working independently of
                    // metadata extraction. If our daily update check was
                    // skipped, a 403 gets one forced refresh and one retry.
                    if (
                        !refreshedBeforeDownload &&
                        isForbiddenMediaError(error) &&
                        refreshYtDlpIfNeeded(force = true)
                    ) {
                        directory.listFiles()?.forEach { it.deleteRecursively() }
                        executeDownload()
                    } else {
                        throw error
                    }
                }

                val output = directory.listFiles()?.firstOrNull {
                    it.isFile && !it.name.endsWith(".part") && !it.name.endsWith(".ytdl")
                } ?: throw IllegalStateException("The local media engine produced no output file.")
                val hash = sha256(output)
                val mimeType = mimeType(output)
                val job = MediaJob(directory, output, hash, output.length(), mimeType)
                jobs[jobId] = job
                preparationErrors.remove(jobId)

                val response = preparedMediaResponse(jobId, job)
                // Keep the foreground service alive while the user approves
                // the short-lived Blossom token in an external signer.
                keepAliveForUpload = true
                invoke.resolve(response)
            } catch (error: Exception) {
                Log.e(TAG, "Local media preparation failed", error)
                directory.deleteRecursively()
                val message = usefulMessage(error, "Local media download failed")
                preparationErrors[jobId] = message
                invoke.reject(message)
            } finally {
                preparingJobs.remove(jobId)
                if (!keepAliveForUpload) stopTransferService()
            }
        }
    }

    @Command
    fun status(invoke: Invoke) {
        val args = invoke.parseArgs(JobIdArgs::class.java)
        if (!isValidJobId(args.jobId)) {
            invoke.reject("Invalid media job ID.")
            return
        }

        val response = JSObject()
        val job = jobs[args.jobId]
        val error = preparationErrors[args.jobId]
        when {
            job != null -> {
                response.put("state", "prepared")
                response.put("media", preparedMediaResponse(args.jobId, job))
            }
            error != null -> {
                response.put("state", "failed")
                response.put("error", error)
            }
            preparingJobs.contains(args.jobId) -> response.put("state", "preparing")
            else -> response.put("state", "missing")
        }
        invoke.resolve(response)
    }

    @Command
    fun upload(invoke: Invoke) {
        val args = invoke.parseArgs(UploadArgs::class.java)
        val job = jobs[args.jobId]
        if (job == null || !job.file.isFile) {
            invoke.reject("Local media file was not found. Download it again.")
            return
        }

        val uploadUrl = try {
            blossomUploadUrl(args.blossomUrl)
        } catch (error: Exception) {
            invoke.reject(error.message ?: "Invalid Blossom server.")
            return
        }
        try {
            validateAuthEvent(args.signedAuthEvent, job.sha256, uploadUrl.host)
        } catch (error: Exception) {
            invoke.reject(error.message ?: "Invalid Blossom authorization.")
            return
        }

        startTransferService()
        executor.execute {
            var connection: HttpURLConnection? = null
            try {
                connection = uploadUrl.openConnection() as HttpURLConnection
                connection.requestMethod = "PUT"
                connection.doOutput = true
                connection.connectTimeout = 20_000
                connection.readTimeout = 60_000
                connection.setFixedLengthStreamingMode(job.size)
                connection.setRequestProperty("Content-Type", job.mimeType)
                connection.setRequestProperty("Content-Length", job.size.toString())
                connection.setRequestProperty("X-SHA-256", job.sha256)
                val auth = Base64.encodeToString(
                    args.signedAuthEvent.toByteArray(Charsets.UTF_8),
                    Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING,
                )
                connection.setRequestProperty("Authorization", "Nostr $auth")

                job.file.inputStream().buffered().use { input ->
                    connection.outputStream.buffered().use { output ->
                        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                        var uploaded = 0L
                        while (true) {
                            val read = input.read(buffer)
                            if (read < 0) break
                            output.write(buffer, 0, read)
                            uploaded += read
                            val event = JSObject()
                            event.put("stage", "uploading")
                            event.put("progress", (uploaded * 100.0 / job.size).coerceIn(0.0, 100.0))
                            event.put("message", "Uploading to Blossom…")
                            trigger("progress", event)
                        }
                    }
                }

                val status = connection.responseCode
                val responseBody = (if (status in 200..299) {
                    connection.inputStream
                } else {
                    connection.errorStream
                })?.bufferedReader()?.use { it.readText() }.orEmpty()
                if (status !in 200..299) {
                    throw IllegalStateException(
                        "Blossom upload failed ($status): ${responseBody.take(300)}",
                    )
                }

                val blob = JSONObject(responseBody)
                val response = JSObject()
                response.put("url", blob.getString("url"))
                response.put("sha256", blob.optString("sha256", job.sha256))
                response.put("size", blob.optLong("size", job.size))
                response.put("mimeType", job.mimeType)
                invoke.resolve(response)
            } catch (error: Exception) {
                Log.e(TAG, "Blossom upload failed", error)
                invoke.reject(usefulMessage(error, "Blossom upload failed"))
            } finally {
                connection?.disconnect()
                cleanup(args.jobId)
                stopTransferService()
            }
        }
    }

    @Command
    fun discard(invoke: Invoke) {
        val args = invoke.parseArgs(JobIdArgs::class.java)
        cleanup(args.jobId)
        stopTransferService()
        invoke.resolve()
    }

    @Command
    fun cancel(invoke: Invoke) {
        val args = invoke.parseArgs(JobIdArgs::class.java)
        YoutubeDL.destroyProcessById(args.jobId)
        cleanup(args.jobId)
        stopTransferService()
        invoke.resolve()
    }

    private fun cleanup(jobId: String) {
        preparationErrors.remove(jobId)
        preparingJobs.remove(jobId)
        val job = jobs.remove(jobId)
        (job?.directory ?: File(activity.cacheDir, "media-jobs/$jobId")).deleteRecursively()
    }

    private fun preparedMediaResponse(jobId: String, job: MediaJob): JSObject = JSObject().apply {
        put("jobId", jobId)
        put("sha256", job.sha256)
        put("size", job.size)
        put("mimeType", job.mimeType)
    }

    private fun isValidJobId(jobId: String): Boolean =
        jobId.length in 8..80 && jobId.all { it.isLetterOrDigit() || it == '-' || it == '_' }

    private fun formatSelector(format: String): String = when (format) {
        "audio" -> "bestaudio[ext=m4a]/bestaudio"
        "360p" -> videoFormatSelector(360)
        "480p" -> videoFormatSelector(480)
        "720p" -> videoFormatSelector(720)
        else -> throw IllegalArgumentException("Unsupported media format.")
    }

    private fun videoFormatSelector(height: Int): String =
        "bestvideo[height<=$height][ext=mp4]+bestaudio[ext=m4a]/" +
            "bestvideo[height<=$height]+bestaudio/" +
            "best[height<=$height]/bestvideo+bestaudio/best"

    /**
     * Keep the extractor current without making GitHub availability a hard
     * dependency. The APK carries a checksum-pinned stable fallback; this
     * daily check lets installed apps survive future YouTube player changes.
     */
    private fun refreshYtDlpIfNeeded(force: Boolean = false): Boolean {
        if (runtimeUpdateChecked) return false

        val preferences = activity.getSharedPreferences(RUNTIME_PREFS, Activity.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        val lastCheck = preferences.getLong(LAST_RUNTIME_UPDATE_CHECK, 0L)
        if (!force && now - lastCheck < RUNTIME_UPDATE_INTERVAL_MS) return false

        runtimeUpdateChecked = true
        val event = JSObject()
        event.put("stage", "preparing")
        event.put("message", "Checking the local media engine…")
        trigger("progress", event)

        return try {
            val previousVersion = YoutubeDL.versionName(activity.applicationContext)
            val status = YoutubeDL.updateYoutubeDL(
                activity.applicationContext,
                YoutubeDL.UpdateChannel.STABLE,
            )
            preferences.edit().putLong(LAST_RUNTIME_UPDATE_CHECK, now).apply()
            Log.i(
                TAG,
                "yt-dlp update check: $status ($previousVersion -> " +
                    "${YoutubeDL.versionName(activity.applicationContext)})",
            )
            true
        } catch (error: Exception) {
            // Downloads can still work with the pinned APK copy while offline
            // or when GitHub is temporarily unreachable.
            Log.w(TAG, "Could not refresh yt-dlp; using bundled runtime", error)
            false
        }
    }

    private fun isForbiddenMediaError(error: Exception): Boolean =
        generateSequence<Throwable>(error) { it.cause }
            .mapNotNull { it.message }
            .any { message -> message.contains("HTTP Error 403") }

    private fun blossomUploadUrl(raw: String): URL {
        val uri = URI(raw.trim())
        require(uri.scheme.equals("https", ignoreCase = true)) {
            "Blossom uploads require an HTTPS server."
        }
        require(!uri.host.isNullOrBlank()) { "Invalid Blossom server." }
        return URI(raw.trim().trimEnd('/') + "/upload").toURL()
    }

    private fun validateAuthEvent(raw: String, hash: String, server: String) {
        val event = JSONObject(raw)
        require(event.optInt("kind") == 24242) { "Invalid Blossom authorization kind." }
        val tags = event.getJSONArray("tags")
        fun hasTag(name: String, value: String): Boolean {
            for (index in 0 until tags.length()) {
                val tag = tags.optJSONArray(index) ?: continue
                if (tag.optString(0) == name && tag.optString(1) == value) return true
            }
            return false
        }
        require(
            hasTag("t", "upload") && hasTag("x", hash) && hasTag("server", server),
        ) { "Blossom authorization does not match this file and server." }
        val expiration = (0 until tags.length())
            .mapNotNull { tags.optJSONArray(it) }
            .firstOrNull { it.optString(0) == "expiration" }
            ?.optLong(1, 0L)
            ?: 0L
        require(expiration > System.currentTimeMillis() / 1000L) {
            "Blossom authorization has expired."
        }
        require(
            event.optString("id").isNotBlank() &&
                event.optString("pubkey").isNotBlank() &&
                event.optString("sig").isNotBlank(),
        ) { "The Blossom authorization was not signed." }
    }

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().buffered().use { input ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private fun mimeType(file: File): String {
        val extension = file.extension.lowercase()
        return when (extension) {
            "m4a" -> "audio/mp4"
            "mp3" -> "audio/mpeg"
            "webm", "weba" -> "video/webm"
            "mp4" -> "video/mp4"
            else -> MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension)
                ?: "application/octet-stream"
        }
    }

    private fun usefulMessage(error: Exception, fallback: String): String {
        val details = generateSequence<Throwable>(error) { it.cause }
            .mapNotNull { it.message }
            .flatMap { it.lineSequence() }
            .filter { it.isNotBlank() }
            .toList()
            .takeLast(8)
            .distinct()
            .joinToString("\n")
        return details.ifBlank { fallback }
    }

    private fun startTransferService() {
        val intent = Intent(activity, MediaDownloadService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(activity, intent)
        } else {
            activity.startService(intent)
        }
    }

    private fun stopTransferService() {
        activity.stopService(Intent(activity, MediaDownloadService::class.java))
    }

    companion object {
        private const val TAG = "WavefuncMedia"
        private const val RUNTIME_PREFS = "wavefunc_media_runtime"
        private const val LAST_RUNTIME_UPDATE_CHECK = "last_update_check_ms"
        private const val RUNTIME_UPDATE_INTERVAL_MS = 24L * 60L * 60L * 1000L
    }
}
