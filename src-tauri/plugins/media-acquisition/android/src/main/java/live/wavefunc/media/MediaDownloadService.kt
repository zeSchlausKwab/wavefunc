package live.wavefunc.media

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.os.Handler
import android.os.Looper
import androidx.core.app.NotificationCompat

/** Keeps Android from suspending the process during a user-requested transfer. */
class MediaDownloadService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private val timeout = Runnable { stopSelf() }

    override fun onCreate() {
        super.onCreate()
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "Media downloads",
                NotificationManager.IMPORTANCE_LOW,
            ),
        )
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(applicationInfo.icon)
            .setContentTitle("WaveFunc")
            .setContentText("Saving media to Blossom…")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .apply {
                if (launchIntent != null) {
                    setContentIntent(
                        android.app.PendingIntent.getActivity(
                            this@MediaDownloadService,
                            0,
                            launchIntent,
                            android.app.PendingIntent.FLAG_UPDATE_CURRENT or
                                android.app.PendingIntent.FLAG_IMMUTABLE,
                        ),
                    )
                }
            }
            .build()
        startForeground(NOTIFICATION_ID, notification)
        handler.postDelayed(timeout, MAX_LIFETIME_MS)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_NOT_STICKY

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        handler.removeCallbacks(timeout)
        super.onDestroy()
    }

    companion object {
        private const val CHANNEL_ID = "wavefunc_media_downloads"
        private const val NOTIFICATION_ID = 7302
        private const val MAX_LIFETIME_MS = 15 * 60 * 1000L
    }
}
