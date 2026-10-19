package com.studyplanner.app

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.media.AudioAttributes
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        NotificationHelper.post(
            context,
            intent.getStringExtra("title") ?: "Study reminder",
            intent.getStringExtra("body") ?: "It is time to study.",
            intent.getIntExtra("notification_id", 1001),
            intent.getStringExtra("sound_uri")
        )
    }
}

internal object NotificationHelper {
    private const val CHANNEL_ID = "study_planner_reminders"

    fun post(context: Context, title: String, body: String, id: Int, soundUri: String? = null) {
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channelId = soundUri?.takeIf { it.isNotBlank() }?.let { "study_alarm_${it.hashCode()}" } ?: CHANNEL_ID
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL_ID) == null) {
            manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Study reminders", NotificationManager.IMPORTANCE_HIGH))
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(channelId) == null) {
            val channel = NotificationChannel(channelId, "Study alarm with custom MP3", NotificationManager.IMPORTANCE_HIGH)
            channel.description = "Plays the MP3 selected in Study Planner when your alarm rings"
            if (!soundUri.isNullOrBlank()) {
                channel.setSound(Uri.parse(soundUri), AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build())
            }
            manager.createNotificationChannel(channel)
        }
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(context, channelId)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(context)
        }
        val notificationBuilder = builder
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setCategory(Notification.CATEGORY_ALARM)
            .setDefaults(Notification.DEFAULT_SOUND or Notification.DEFAULT_VIBRATE)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O && !soundUri.isNullOrBlank()) {
            notificationBuilder.setSound(Uri.parse(soundUri))
        }
        val notification = notificationBuilder.build()
        manager.notify(id, notification)
    }
}
