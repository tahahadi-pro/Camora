package expo.modules.camorabackground

import android.content.Context
import android.content.Intent
import android.os.Build
import expo.modules.kotlin.exception.Exceptions
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
  }
}
