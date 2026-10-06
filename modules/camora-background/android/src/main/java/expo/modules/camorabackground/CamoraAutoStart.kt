package expo.modules.camorabackground

import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.util.Log

/**
 * Re-opens Camora without the user touching the phone (e.g. after a reboot), so the
 * camera host can register again. Android 10+ only allows an app to open itself from the
 * background when it holds the "Display over other apps" permission.
 */
object CamoraAutoStart {
  private const val PREFS = "camora-background"
  private const val KEY_ENABLED = "autoStart"
  private const val KEY_PENDING = "pendingBackgroundLaunch"
  private const val TAG = "CamoraAutoStart"

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun setEnabled(context: Context, enabled: Boolean) {
    prefs(context).edit().putBoolean(KEY_ENABLED, enabled).apply()
  }

  fun canLaunchFromBackground(context: Context) =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || Settings.canDrawOverlays(context)

  /** True once after Camora was opened by [launchInBackground]. */
  fun consumePendingLaunch(context: Context): Boolean {
    val pending = prefs(context).getBoolean(KEY_PENDING, false)
    if (pending) prefs(context).edit().remove(KEY_PENDING).apply()
    return pending
  }

  fun launchInBackground(context: Context) {
    if (!prefs(context).getBoolean(KEY_ENABLED, false)) return
    if (!canLaunchFromBackground(context)) {
      Log.w(TAG, "Display over other apps is not allowed; cannot auto-start")
      return
    }
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    prefs(context).edit().putBoolean(KEY_PENDING, true).commit()
    try {
      context.startActivity(intent)
    } catch (e: Exception) {
      Log.w(TAG, "Auto-start failed", e)
    }
  }
}
