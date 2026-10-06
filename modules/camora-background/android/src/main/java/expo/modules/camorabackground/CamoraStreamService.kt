package expo.modules.camorabackground

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log

/**
 * Keeps the app process alive with camera/microphone foreground-service rights so the
 * JS camera host can open the camera for a viewer while the app is in the background.
 * Android only allows this when the service is started while the app is visible.
 */
class CamoraStreamService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null
  private var wifiLock: WifiManager.WifiLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "Camora"
    val body = intent?.getStringExtra(EXTRA_BODY) ?: "Camera is ready for viewers"

    try {
      val notification = buildNotification(this, title, body)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        startForeground(NOTIFICATION_ID, notification, serviceTypes())
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (e: Exception) {
      Log.w(TAG, "Could not start camera foreground service", e)
      running = false
      stopSelf()
      return START_NOT_STICKY
    }

    acquireLocks()
    running = true
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    running = false
    wakeLock?.takeIf { it.isHeld }?.release()
    wakeLock = null
    wifiLock?.takeIf { it.isHeld }?.release()
    wifiLock = null
    super.onDestroy()
  }

  private fun serviceTypes(): Int {
    var types = 0
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      if (isGranted(Manifest.permission.CAMERA)) {
        types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
      }
      if (isGranted(Manifest.permission.RECORD_AUDIO)) {
        types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
      }
    }
    return types
  }

  private fun isGranted(permission: String) =
    checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

  private fun acquireLocks() {
    if (wakeLock?.isHeld != true) {
      val power = getSystemService(Context.POWER_SERVICE) as PowerManager
      wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "camora:camera-host").apply {
        setReferenceCounted(false)
        acquire()
      }
    }
    if (wifiLock?.isHeld != true) {
      val wifi = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
      @Suppress("DEPRECATION")
      wifiLock = wifi.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "camora:camera-host").apply {
        setReferenceCounted(false)
        acquire()
      }
    }
  }

  companion object {
    const val EXTRA_TITLE = "title"
    const val EXTRA_BODY = "body"
    // New id because Android never lowers the importance of an existing channel.
    private const val CHANNEL_ID = "camora-camera-host-silent"
    private const val NOTIFICATION_ID = 4107
    private const val TAG = "CamoraStreamService"

    @Volatile
    var running = false
      private set

    fun updateNotification(context: Context, title: String, body: String) {
      if (!running) return
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.notify(NOTIFICATION_ID, buildNotification(context, title, body))
    }

    private fun buildNotification(context: Context, title: String, body: String): Notification {
      val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.deleteNotificationChannel("camora-camera-host")
        if (manager.getNotificationChannel(CHANNEL_ID) == null) {
          manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "CCTV Camera", NotificationManager.IMPORTANCE_MIN).apply {
              setShowBadge(false)
              setSound(null, null)
              enableVibration(false)
              lockscreenVisibility = Notification.VISIBILITY_SECRET
            }
          )
        }
        Notification.Builder(context, CHANNEL_ID)
      } else {
        @Suppress("DEPRECATION")
        Notification.Builder(context)
      }

      val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
      val contentIntent = launchIntent?.let {
        PendingIntent.getActivity(
          context,
          0,
          it,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
      }

      @Suppress("DEPRECATION")
      builder.setPriority(Notification.PRIORITY_MIN)

      return builder
        .setContentTitle(title)
        .setContentText(body)
        .setSmallIcon(smallIcon(context))
        .setOngoing(true)
        .setContentIntent(contentIntent)
        .build()
    }

    private fun smallIcon(context: Context): Int {
      val generated = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
      return if (generated != 0) generated else context.applicationInfo.icon
    }
  }
}
