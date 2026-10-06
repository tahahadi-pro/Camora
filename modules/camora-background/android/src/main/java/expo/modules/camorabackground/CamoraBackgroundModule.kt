package expo.modules.camorabackground

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
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

    // React Native stops JS timers in the background unless a headless task is active, which
    // would freeze socket.io reconnects after the network drops. This task keeps them running.
    AsyncFunction("startKeepAlive") {
      val tasks = HeadlessJsTaskContext.getInstance(reactContext)
      keepAliveTaskId?.let { if (tasks.isTaskRunning(it)) return@AsyncFunction }
      keepAliveTaskId = tasks.startTask(
        HeadlessJsTaskConfig(KEEP_ALIVE_TASK, Arguments.createMap(), 0, true)
      )
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("stopKeepAlive") {
      keepAliveTaskId?.let { HeadlessJsTaskContext.getInstance(reactContext).finishTask(it) }
      keepAliveTaskId = null
    }.runOnQueue(Queues.MAIN)

    Function("isIgnoringBatteryOptimizations") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return@Function true
      val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      power.isIgnoringBatteryOptimizations(context.packageName)
    }

    AsyncFunction("requestIgnoreBatteryOptimizations") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return@AsyncFunction
      val intent = Intent(
        Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
        Uri.parse("package:${context.packageName}")
      ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try {
        context.startActivity(intent)
      } catch (e: Exception) {
        context.startActivity(
          Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
      }
    }
  }

  private val reactContext: ReactContext
    get() = appContext.reactContext as? ReactContext ?: throw Exceptions.ReactContextLost()

  private var keepAliveTaskId: Int? = null

  companion object {
    private const val KEEP_ALIVE_TASK = "CamoraKeepAlive"
  }
}
