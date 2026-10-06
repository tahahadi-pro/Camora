package expo.modules.camorabackground

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CamoraBackgroundModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("CamoraBackground")

    Function("isRunning") {
      CamoraStreamService.running
    }

    AsyncFunction("start") { title: String, body: String ->
      val intent = Intent(context, CamoraStreamService::class.java)
        .putExtra(CamoraStreamService.EXTRA_TITLE, title)
        .putExtra(CamoraStreamService.EXTRA_BODY, body)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    AsyncFunction("update") { title: String, body: String ->
      CamoraStreamService.updateNotification(context, title, body)
    }

    AsyncFunction("stop") {
      context.stopService(Intent(context, CamoraStreamService::class.java))
    }

    Function("setAutoStartEnabled") { enabled: Boolean ->
      CamoraAutoStart.setEnabled(context, enabled)
    }

    Function("canAutoStart") {
      CamoraAutoStart.canLaunchFromBackground(context)
    }

    Function("consumeBackgroundLaunch") {
      CamoraAutoStart.consumePendingLaunch(context)
    }

    AsyncFunction("openAutoStartSettings") {
      val intent = Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        Uri.parse("package:${context.packageName}")
      ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    AsyncFunction("moveToBackground") {
      appContext.currentActivity?.moveTaskToBack(true)
    }.runOnQueue(Queues.MAIN)
  }
}
