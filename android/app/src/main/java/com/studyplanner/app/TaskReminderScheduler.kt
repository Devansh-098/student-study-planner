package com.studyplanner.app

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONArray
import java.text.SimpleDateFormat
import java.util.Locale

internal object TaskReminderScheduler {
    private const val PREFS = "planner_reminders"
    private const val TASKS_JSON = "task_reminders_json"
    private const val TASK_IDS = "task_ids"
    private const val ALARM_AT = "alarm_at"
    private const val ALARM_TITLE = "alarm_title"
    private const val ALARM_SOUND = "scheduled_alarm_sound_uri"
    private const val STUDY_ALARM_ID = 0x534451

    fun scheduleTasks(context: Context, json: String) {
        try {
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val oldIds = prefs.getStringSet(TASK_IDS, emptySet()).orEmpty().toSet()
            val newIds = mutableSetOf<String>()
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val tasks = JSONArray(json)
            for (index in 0 until tasks.length()) {
                val task = tasks.getJSONObject(index)
                val id = task.optString("id")
                if (id.isBlank()) continue
                val dateTime = "${task.optString("date")} ${task.optString("time")}"
                val parser = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).apply { isLenient = false }
                val at = try { parser.parse(dateTime)?.time ?: continue } catch (_: Exception) { continue }
                if (at <= System.currentTimeMillis()) continue
                val requestCode = taskRequestCode(id)
                val intent = Intent(context, ReminderReceiver::class.java).apply {
                    putExtra("title", "Study task reminder")
                    putExtra("body", task.optString("title", "It is time to study."))
                    putExtra("notification_id", requestCode)
                }
                val pending = PendingIntent.getBroadcast(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag())
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
                newIds.add(id)
            }
            (oldIds - newIds).forEach { id ->
                val pending = PendingIntent.getBroadcast(context, taskRequestCode(id), Intent(context, ReminderReceiver::class.java), PendingIntent.FLAG_NO_CREATE or immutableFlag())
                if (pending != null) alarmManager.cancel(pending)
            }
            prefs.edit().putString(TASKS_JSON, json).putStringSet(TASK_IDS, newIds).apply()
        } catch (_: Exception) { }
    }

    fun scheduleAlarm(context: Context, timestamp: Long, title: String, soundUri: String) {
        if (timestamp <= System.currentTimeMillis()) return
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val savedSound = soundUri.ifBlank { prefs.getString("alarm_sound_uri", "").orEmpty() }
        prefs.edit().putLong(ALARM_AT, timestamp).putString(ALARM_TITLE, title).putString(ALARM_SOUND, savedSound).apply()
        scheduleSavedAlarm(context, timestamp, title, savedSound)
    }

    fun cancelAlarm(context: Context) {
        val pending = PendingIntent.getBroadcast(context, STUDY_ALARM_ID, Intent(context, ReminderReceiver::class.java), PendingIntent.FLAG_NO_CREATE or immutableFlag())
        if (pending != null) (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(pending)
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(ALARM_AT).remove(ALARM_TITLE).remove(ALARM_SOUND).apply()
    }

    fun rescheduleAfterRestart(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.getString(TASKS_JSON, null)?.let { scheduleTasks(context, it) }
        val at = prefs.getLong(ALARM_AT, 0L)
        if (at > System.currentTimeMillis()) {
            scheduleSavedAlarm(context, at, prefs.getString(ALARM_TITLE, "Study alarm") ?: "Study alarm", prefs.getString(ALARM_SOUND, "").orEmpty())
        } else if (at != 0L) {
            prefs.edit().remove(ALARM_AT).remove(ALARM_TITLE).remove(ALARM_SOUND).apply()
        }
    }

    private fun scheduleSavedAlarm(context: Context, timestamp: Long, title: String, soundUri: String) {
        val intent = Intent(context, ReminderReceiver::class.java).apply {
            putExtra("title", title)
            putExtra("body", "It is time for your planned study session.")
            putExtra("notification_id", STUDY_ALARM_ID)
            putExtra("sound_uri", soundUri)
        }
        val pending = PendingIntent.getBroadcast(context, STUDY_ALARM_ID, intent, PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag())
        (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, timestamp, pending)
    }

    private fun taskRequestCode(id: String) = ("task:" + id).hashCode()

    private fun immutableFlag() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
}

class ReminderRescheduleReceiver : android.content.BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        TaskReminderScheduler.rescheduleAfterRestart(context)
    }
}
