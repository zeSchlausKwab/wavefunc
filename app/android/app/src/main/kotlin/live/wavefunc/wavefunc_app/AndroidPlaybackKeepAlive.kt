package live.wavefunc.wavefunc_app

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.net.wifi.WifiManager
import android.os.Build
import android.os.PowerManager
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodChannel
import java.lang.ref.WeakReference

/**
 * Holds Android CPU (`PARTIAL_WAKE_LOCK`) and Wi-Fi (`WifiLock`) locks while
 * live radio playback is active, and handles runtime `POST_NOTIFICATIONS`
 * permission requests on Android 13+ so the status bar icon and Pixel Quick
 * Settings media controls are always visible.
 *
 * Locks are attached to the application context so they survive swiping
 * `MainActivity` out of Android Recents while `AudioService` keeps playing.
 */
object AndroidPlaybackKeepAlive {
    private const val CHANNEL = "live.wavefunc.app/playback_keepalive"
    private const val REQ_POST_NOTIFICATIONS = 5601

    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null
    private var activityRef: WeakReference<Activity>? = null
    private var notificationPromptedThisProcess = false

    fun attachActivity(activity: Activity) {
        activityRef = WeakReference(activity)
    }

    fun detachActivity(activity: Activity) {
        if (activityRef?.get() === activity) {
            activityRef = null
        }
    }

    fun register(context: Context, messenger: BinaryMessenger) {
        val appContext = context.applicationContext
        MethodChannel(messenger, CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "setActive" -> {
                    val active = call.argument<Boolean>("active") ?: false
                    setLocksActive(appContext, active)
                    result.success(null)
                }

                "requestNotificationPermission" -> {
                    val force = call.argument<Boolean>("force") ?: false
                    val granted = ensureNotificationPermission(appContext, force = force)
                    result.success(granted)
                }

                else -> result.notImplemented()
            }
        }
    }

    @Synchronized
    fun setLocksActive(context: Context, active: Boolean) {
        if (active) {
            acquireLocks(context)
        } else {
            releaseLocks()
        }
    }

    @Suppress("DEPRECATION")
    private fun acquireLocks(context: Context) {
        try {
            if (wakeLock == null) {
                val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
                wakeLock = pm?.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK,
                    "live.wavefunc.app:radio_playback",
                )?.apply {
                    setReferenceCounted(false)
                }
            }
            if (wakeLock?.isHeld == false) {
                wakeLock?.acquire()
            }
        } catch (_: Exception) {
            // Best-effort; AudioService also holds its own wake lock.
        }

        try {
            if (wifiLock == null) {
                val wm = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
                val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    WifiManager.WIFI_MODE_FULL_LOW_LATENCY
                } else {
                    WifiManager.WIFI_MODE_FULL_HIGH_PERF
                }
                wifiLock = wm?.createWifiLock(mode, "live.wavefunc.app:radio_wifi")?.apply {
                    setReferenceCounted(false)
                }
            }
            if (wifiLock?.isHeld == false) {
                wifiLock?.acquire()
            }
        } catch (_: Exception) {
            // Best-effort on devices without Wi-Fi hardware.
        }
    }

    private fun releaseLocks() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
            }
        } catch (_: Exception) {}
        try {
            if (wifiLock?.isHeld == true) {
                wifiLock?.release()
            }
        } catch (_: Exception) {}
    }

    fun ensureNotificationPermission(context: Context, force: Boolean = false): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return true
        }
        val granted = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED
        if (granted) return true

        val activity = activityRef?.get() ?: return false
        if (!force && notificationPromptedThisProcess) return false
        notificationPromptedThisProcess = true
        ActivityCompat.requestPermissions(
            activity,
            arrayOf(Manifest.permission.POST_NOTIFICATIONS),
            REQ_POST_NOTIFICATIONS,
        )
        return false
    }
}
