package expo.modules.camorabackground

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class CamoraBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED,
      "android.intent.action.QUICKBOOT_POWERON",
      "com.htc.intent.action.QUICKBOOT_POWERON" -> CamoraAutoStart.launchInBackground(context)
    }
  }
}
