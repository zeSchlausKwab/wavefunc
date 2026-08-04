package live.wavefunc.player

import android.Manifest
import android.app.Activity
import android.content.ComponentName
import android.net.Uri
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import app.tauri.PermissionState
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.google.common.util.concurrent.ListenableFuture

@InvokeArg
class PlayArgs {
    lateinit var url: String
    var alternatives: Array<String> = emptyArray()
    lateinit var stationId: String
    lateinit var stationName: String
    var artworkUrl: String? = null
    var song: String? = null
    var artist: String? = null
}

@InvokeArg
class MetadataArgs {
    lateinit var stationName: String
    var artworkUrl: String? = null
    var song: String? = null
    var artist: String? = null
}

@InvokeArg
class VolumeArgs {
    var volume: Float = 0.7f
    var muted: Boolean = false
}

/** Tauri command surface for the service-owned Media3 player. */
@TauriPlugin(
    permissions = [
        Permission(
            strings = [Manifest.permission.POST_NOTIFICATIONS],
            alias = "notifications",
        ),
    ],
)
class WavefuncPlayerPlugin(private val activity: Activity) : Plugin(activity) {
    private val mainExecutor = ContextCompat.getMainExecutor(activity)
    private val controllerFuture: ListenableFuture<MediaController> by lazy {
        val token = SessionToken(
            activity,
            ComponentName(activity, WavefuncPlaybackService::class.java),
        )
        MediaController.Builder(activity, token).buildAsync().also { future ->
            future.addListener(
                {
                    runCatching { future.get() }
                        .onSuccess { it.addListener(playerListener) }
                        .onFailure { emitFailure(it.message ?: "Media controller failed") }
                },
                mainExecutor,
            )
        }
    }

    private val playerListener = object : Player.Listener {
        override fun onEvents(player: Player, events: Player.Events) {
            if (
                events.contains(Player.EVENT_PLAYBACK_STATE_CHANGED) ||
                events.contains(Player.EVENT_PLAY_WHEN_READY_CHANGED) ||
                events.contains(Player.EVENT_IS_PLAYING_CHANGED)
            ) {
                emitState(player)
            }
        }
    }

    @Command
    fun play(invoke: Invoke) {
        val permissionState = getPermissionState("notifications")
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            (permissionState == PermissionState.PROMPT ||
                permissionState == PermissionState.PROMPT_WITH_RATIONALE)
        ) {
            // Ask at the moment the user starts playback. If they decline,
            // the callback still starts audio; Android simply suppresses the
            // notification from the drawer until permission is granted.
            requestPermissionForAlias(
                "notifications",
                invoke,
                "playAfterNotificationPermission",
            )
            return
        }

        playAfterNotificationPermission(invoke)
    }

    @PermissionCallback
    fun playAfterNotificationPermission(invoke: Invoke) {
        val args = invoke.parseArgs(PlayArgs::class.java)
        val uri = validatedStreamUri(args.url)
        if (uri == null) {
            invoke.reject("Only HTTP and HTTPS radio streams are supported")
            return
        }

        withController(invoke) { controller ->
            val metadata = buildMetadata(
                stationName = args.stationName,
                artworkUrl = args.artworkUrl,
                song = args.song,
                artist = args.artist,
            )
            val urls = listOf(uri) + args.alternatives.mapNotNull(::validatedStreamUri)
            val items = urls.distinct().mapIndexed { index, candidate ->
                MediaItem.Builder()
                    .setUri(candidate)
                    .setMediaId("${args.stationId}:$index")
                    .setMediaMetadata(metadata)
                    .build()
            }
            controller.setMediaItems(items)
            controller.prepare()
            controller.play()
        }
    }

    @Command
    fun pause(invoke: Invoke) = withController(invoke) { it.pause() }

    @Command
    fun resume(invoke: Invoke) = withController(invoke) { it.play() }

    @Command
    fun stop(invoke: Invoke) = withController(invoke) {
        it.stop()
        it.clearMediaItems()
    }

    @Command
    fun updateMetadata(invoke: Invoke) {
        val args = invoke.parseArgs(MetadataArgs::class.java)
        withController(invoke) { controller ->
            val metadata = buildMetadata(
                stationName = args.stationName,
                artworkUrl = args.artworkUrl,
                song = args.song,
                artist = args.artist,
            )
            for (index in 0 until controller.mediaItemCount) {
                val updated = controller.getMediaItemAt(index)
                    .buildUpon()
                    .setMediaMetadata(metadata)
                    .build()
                controller.replaceMediaItem(index, updated)
            }
        }
    }

    @Command
    fun setVolume(invoke: Invoke) {
        val args = invoke.parseArgs(VolumeArgs::class.java)
        withController(invoke) { controller ->
            controller.volume = if (args.muted) 0f else args.volume.coerceIn(0f, 1f)
        }
    }

    private fun withController(invoke: Invoke, action: (MediaController) -> Unit) {
        val future = controllerFuture
        future.addListener(
            {
                try {
                    action(future.get())
                    val response = JSObject()
                    response.put("ok", true)
                    invoke.resolve(response)
                } catch (error: Exception) {
                    invoke.reject(error.message ?: "Native playback command failed")
                }
            },
            mainExecutor,
        )
    }

    private fun emitState(player: Player) {
        val state = when {
            player.playerError != null -> "failed"
            player.playbackState == Player.STATE_BUFFERING -> "buffering"
            player.isPlaying -> "playing"
            player.playbackState == Player.STATE_IDLE && player.mediaItemCount == 0 -> "idle"
            !player.playWhenReady -> "paused"
            else -> "loading"
        }
        val payload = JSObject()
        payload.put("state", state)
        player.currentMediaItem?.localConfiguration?.uri?.toString()?.let {
            payload.put("url", it)
        }
        player.playerError?.message?.let { payload.put("error", it) }
        trigger("state", payload)
    }

    private fun emitFailure(message: String) {
        val payload = JSObject()
        payload.put("state", "failed")
        payload.put("error", message)
        trigger("state", payload)
    }

    private fun buildMetadata(
        stationName: String,
        artworkUrl: String?,
        song: String?,
        artist: String?,
    ): MediaMetadata {
        val cleanSong = song?.trim()?.takeIf { it.isNotEmpty() && it != "No metadata available" }
        val cleanArtist = artist?.trim()?.takeIf { it.isNotEmpty() }
        val artwork = artworkUrl?.let(::validatedRemoteUri)

        return MediaMetadata.Builder()
            .setTitle(cleanSong ?: stationName)
            .setArtist(cleanArtist ?: if (cleanSong != null) stationName else "WaveFunc Radio")
            .setAlbumTitle(if (cleanSong != null) stationName else null)
            .setArtworkUri(artwork)
            .setIsPlayable(true)
            .build()
    }

    private fun validatedStreamUri(raw: String): Uri? {
        val uri = runCatching { Uri.parse(raw.trim()) }.getOrNull() ?: return null
        return if (uri.scheme == "http" || uri.scheme == "https") uri else null
    }

    private fun validatedRemoteUri(raw: String): Uri? {
        val uri = runCatching { Uri.parse(raw.trim()) }.getOrNull() ?: return null
        return if (uri.scheme == "http" || uri.scheme == "https") uri else null
    }
}
