package com.studyplanner.app

import android.app.Activity
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.Manifest
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import java.text.SimpleDateFormat
import java.util.Locale
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebChromeClient
import android.webkit.ValueCallback
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.SetOptions
import org.json.JSONObject
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat

class MainActivity : Activity() {
    private lateinit var plannerView: WebView
    private var uploadFileCallback: ValueCallback<Array<Uri>>? = null
    private val uploadRequestCode = 4102

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.BLACK
        window.navigationBarColor = Color.rgb(244, 245, 250)
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        createNotificationChannel()

        plannerView = WebView(this).apply {
            setBackgroundColor(Color.rgb(244, 245, 250))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = true
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            settings.javaScriptCanOpenWindowsAutomatically = false
            settings.setSupportMultipleWindows(false)
            setOnApplyWindowInsetsListener { view, insets ->
                view.setPadding(
                    insets.systemWindowInsetLeft,
                    insets.systemWindowInsetTop,
                    insets.systemWindowInsetRight,
                    insets.systemWindowInsetBottom
                )
                insets
            }
        }

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        plannerView.addJavascriptInterface(FirebaseBridge(), "StudyPlannerFirebase")
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 4101)
        }

        plannerView.webViewClient = object : WebViewClientCompat() {
            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                if (url.startsWith("https://appassets.androidplatform.net/assets/index.html")) {
                    view.evaluateJavascript("window.StudyPlannerFirebase && window.StudyPlannerFirebase.restoreSession()", null)
                }
            }

            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

            @Suppress("DEPRECATION")
            override fun shouldInterceptRequest(view: WebView, url: String): WebResourceResponse? =
                assetLoader.shouldInterceptRequest(Uri.parse(url))

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                return request.url.host != "appassets.androidplatform.net"
            }
        }

        plannerView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams
            ): Boolean {
                uploadFileCallback?.onReceiveValue(null)
                uploadFileCallback = filePathCallback
                return try {
                    startActivityForResult(fileChooserParams.createIntent(), uploadRequestCode)
                    true
                } catch (_: Exception) {
                    uploadFileCallback = null
                    false
                }
            }
        }

        setContentView(plannerView)
        plannerView.loadUrl("https://appassets.androidplatform.net/assets/index.html?native=1")
    }

    private inner class FirebaseBridge {
        private val auth = FirebaseAuth.getInstance()
        private val database = FirebaseFirestore.getInstance()
        private var plannerListener: ListenerRegistration? = null
        private var interfaceListener: ListenerRegistration? = null
        private var sessionRestoreStarted = false

        @JavascriptInterface
        fun signIn(email: String, password: String) {
            auth.signInWithEmailAndPassword(email.trim(), password)
                .addOnSuccessListener { result -> loadPlannerFor(result.user?.uid, result.user?.email) }
                .addOnFailureListener { reportAuthError(it) }
        }

        @JavascriptInterface
        fun createAccount(email: String, password: String) {
            auth.createUserWithEmailAndPassword(email.trim(), password)
                .addOnSuccessListener { result -> loadPlannerFor(result.user?.uid, result.user?.email) }
                .addOnFailureListener { reportAuthError(it) }
        }

        @JavascriptInterface
        fun restoreSession() {
            if (sessionRestoreStarted) return
            sessionRestoreStarted = true
            val listener = object : FirebaseAuth.AuthStateListener {
                override fun onAuthStateChanged(firebaseAuth: FirebaseAuth) {
                    firebaseAuth.removeAuthStateListener(this)
                    val user = firebaseAuth.currentUser
                    if (user != null) loadPlannerFor(user.uid, user.email)
                }
            }
            auth.addAuthStateListener(listener)
        }

        @JavascriptInterface
        fun savePlannerData(json: String) {
            val uid = auth.currentUser?.uid ?: return
            database.collection("users").document(uid)
                .set(mapOf("plannerJson" to json, "email" to auth.currentUser?.email.orEmpty(), "updatedAt" to FieldValue.serverTimestamp()), SetOptions.merge())
        }

        @JavascriptInterface
        fun isNativeNotifications(): Boolean = true

        @JavascriptInterface
        fun requestNotificationPermission() {
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                runOnUiThread { requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 4101) }
            }
        }

        @JavascriptInterface
        fun showNotification(title: String, body: String) {
            runOnUiThread { postNotification(title, body, 0x534450) }
        }

        @JavascriptInterface
        fun scheduleTaskReminders(json: String) {
            try {
                val tasks = org.json.JSONArray(json)
                val prefs = getSharedPreferences("planner_reminders", MODE_PRIVATE)
                val oldIds = prefs.getStringSet("task_ids", emptySet()).orEmpty().toSet()
                val newIds = mutableSetOf<String>()
                val alarmManager = getSystemService(Context.ALARM_SERVICE) as AlarmManager
                for (index in 0 until tasks.length()) {
                    val task = tasks.getJSONObject(index)
                    val id = task.getString("id")
                    val parsed = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).parse("${task.getString("date")} ${task.getString("time")}") ?: continue
                    val at = parsed.time
                    if (at <= System.currentTimeMillis()) continue
                    val requestCode = ("task:" + id).hashCode()
                    val intent = Intent(this@MainActivity, ReminderReceiver::class.java).apply {
                        putExtra("title", "Study task reminder")
                        putExtra("body", task.getString("title"))
                        putExtra("notification_id", requestCode)
                    }
                    val pending = PendingIntent.getBroadcast(this@MainActivity, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                    alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
                    newIds.add(id)
                }
                (oldIds - newIds).forEach { id ->
                    val code = ("task:" + id).hashCode()
                    val pending = PendingIntent.getBroadcast(this@MainActivity, code, Intent(this@MainActivity, ReminderReceiver::class.java), PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE)
                    if (pending != null) alarmManager.cancel(pending)
                }
                prefs.edit().putStringSet("task_ids", newIds).apply()
            } catch (_: Exception) { }
        }

        @JavascriptInterface
        fun scheduleAlarm(timestamp: Long, title: String, soundUri: String) {
            val intent = Intent(this@MainActivity, ReminderReceiver::class.java).apply {
                putExtra("title", title)
                putExtra("body", "It is time for your planned study session.")
                putExtra("notification_id", 0x534450 + 1)
                putExtra("sound_uri", soundUri.ifBlank { getSharedPreferences("planner_reminders", MODE_PRIVATE).getString("alarm_sound_uri", "") })
            }
            val pending = PendingIntent.getBroadcast(this@MainActivity, 0x534450 + 1, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            (getSystemService(Context.ALARM_SERVICE) as AlarmManager).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, timestamp, pending)
        }

        @JavascriptInterface
        fun cancelAlarm() {
            val pending = PendingIntent.getBroadcast(this@MainActivity, 0x534450 + 1, Intent(this@MainActivity, ReminderReceiver::class.java), PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE)
            if (pending != null) (getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(pending)
        }

        @JavascriptInterface
        fun getAlarmSoundUri(): String = getSharedPreferences("planner_reminders", MODE_PRIVATE).getString("alarm_sound_uri", "").orEmpty()

        @JavascriptInterface
        fun saveAlarmSound(base64: String, originalName: String): String {
            if (Build.VERSION.SDK_INT < 29) return ""
            var newUri: Uri? = null
            try {
                val bytes = Base64.decode(base64, Base64.DEFAULT)
                if (bytes.isEmpty() || bytes.size > 12 * 1024 * 1024) return ""
                val values = ContentValues().apply {
                    put(MediaStore.Audio.Media.DISPLAY_NAME, "StudyPlannerAlarm_${System.currentTimeMillis()}.mp3")
                    put(MediaStore.Audio.Media.MIME_TYPE, "audio/mpeg")
                    put(MediaStore.Audio.Media.RELATIVE_PATH, Environment.DIRECTORY_MUSIC + "/Study Planner")
                    put(MediaStore.Audio.Media.IS_PENDING, 1)
                }
                newUri = contentResolver.insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, values) ?: return ""
                contentResolver.openOutputStream(newUri!!)?.use { it.write(bytes) } ?: return ""
                contentResolver.update(newUri!!, ContentValues().apply { put(MediaStore.Audio.Media.IS_PENDING, 0) }, null, null)
                val prefs = getSharedPreferences("planner_reminders", MODE_PRIVATE)
                val previous = prefs.getString("alarm_sound_uri", null)
                prefs.edit().putString("alarm_sound_uri", newUri.toString()).putString("alarm_sound_name", originalName).apply()
                previous?.let { contentResolver.delete(Uri.parse(it), null, null) }
                return newUri.toString()
            } catch (_: Exception) {
                newUri?.let { contentResolver.delete(it, null, null) }
                return ""
            }
        }

        @JavascriptInterface
        fun clearAlarmSound() {
            val prefs = getSharedPreferences("planner_reminders", MODE_PRIVATE)
            prefs.getString("alarm_sound_uri", null)?.let { uri ->
                try { contentResolver.delete(Uri.parse(uri), null, null) } catch (_: Exception) { }
            }
            prefs.edit().remove("alarm_sound_uri").remove("alarm_sound_name").apply()
        }

        @JavascriptInterface
        fun loadAdminUsers() {
            val user = auth.currentUser ?: return reportAdminError("Sign in with an administrator account.")
            user.getIdToken(false).addOnSuccessListener { token ->
                if (token.claims["admin"] != true) return@addOnSuccessListener reportAdminError("This Firebase account does not have administrator access.")
                database.collection("users").get()
                    .addOnSuccessListener { snapshot ->
                        val users = org.json.JSONArray()
                        snapshot.documents.forEach { userDoc ->
                            val planner = try { JSONObject(userDoc.getString("plannerJson") ?: "{}") } catch (_: Exception) { JSONObject() }
                            users.put(JSONObject().apply {
                                put("uid", userDoc.id)
                                put("email", userDoc.getString("email") ?: "")
                                put("disabled", userDoc.getBoolean("disabled") == true)
                                put("studentName", planner.optString("studentName", ""))
                                put("subjects", planner.optJSONArray("subjects") ?: org.json.JSONArray())
                                put("tasks", planner.optJSONArray("tasks") ?: org.json.JSONArray())
                            })
                        }
                        runJs("window.onAdminUsersLoaded && window.onAdminUsersLoaded(${JSONObject.quote(users.toString())})")
                    }
                    .addOnFailureListener { reportAdminError(it.localizedMessage ?: "Could not load the accounts. Check Firestore Rules.") }
            }.addOnFailureListener { reportAdminError(it.localizedMessage ?: "Could not verify administrator access.") }
        }

        @JavascriptInterface
        fun setUserDisabled(uid: String, disabled: Boolean) {
            val user = auth.currentUser ?: return reportAdminError("Sign in with an administrator account.")
            if (user.uid == uid) return reportAdminError("You cannot pause your own administrator account.")
            user.getIdToken(false).addOnSuccessListener { token ->
                if (token.claims["admin"] != true) return@addOnSuccessListener reportAdminError("This Firebase account does not have administrator access.")
                database.collection("users").document(uid)
                    .update(mapOf("disabled" to disabled, "accessUpdatedAt" to FieldValue.serverTimestamp()))
                    .addOnSuccessListener { reportAdminSuccess("Account access updated.") }
                    .addOnFailureListener { reportAdminError(it.localizedMessage ?: "Could not update account access.") }
            }.addOnFailureListener { reportAdminError(it.localizedMessage ?: "Could not verify administrator access.") }
        }

        @JavascriptInterface
        fun saveInterfaceConfig(configJson: String) {
            val user = auth.currentUser ?: return reportAdminError("Sign in with an administrator account.")
            val config = try { JSONObject(configJson) } catch (_: Exception) { return reportAdminError("The interface settings are invalid.") }
            user.getIdToken(false).addOnSuccessListener { token ->
                if (token.claims["admin"] != true) return@addOnSuccessListener reportAdminError("This Firebase account does not have administrator access.")
                val inputFeatures = config.optJSONObject("features") ?: JSONObject()
                val features = mapOf(
                    "subjects" to inputFeatures.optBoolean("subjects", true),
                    "planner" to inputFeatures.optBoolean("planner", true),
                    "focus" to inputFeatures.optBoolean("focus", true),
                    "progress" to inputFeatures.optBoolean("progress", true)
                )
                val values = mapOf(
                    "brandName" to config.optString("brandName", "Study Planner"),
                    "announcement" to config.optString("announcement", ""),
                    "accentColor" to config.optString("accentColor", "#5a5fd6"),
                    "features" to features,
                    "updatedAt" to FieldValue.serverTimestamp()
                )
                database.collection("appConfig").document("interface").set(values, SetOptions.merge())
                    .addOnSuccessListener { reportAdminSuccess("Published to the website and Android app.") }
                    .addOnFailureListener { reportAdminError(it.localizedMessage ?: "Could not publish interface settings.") }
            }.addOnFailureListener { reportAdminError(it.localizedMessage ?: "Could not verify administrator access.") }
        }

        @JavascriptInterface
        fun signOut() {
            plannerListener?.remove()
            plannerListener = null
            interfaceListener?.remove()
            interfaceListener = null
            auth.signOut()
            runJs("window.onFirebaseSignedOut && window.onFirebaseSignedOut()")
        }

        private fun loadPlannerFor(uid: String?, email: String?) {
            if (uid == null) {
                reportAuthError(IllegalStateException("Firebase did not return a user."))
                return
            }
            plannerListener?.remove()
            interfaceListener?.remove()
            auth.currentUser?.getIdToken(true)?.addOnSuccessListener { token ->
                runJs("window.onFirebaseAdminAccess && window.onFirebaseAdminAccess(${token.claims["admin"] == true})")
            }
            interfaceListener = database.collection("appConfig").document("interface")
                .addSnapshotListener { snapshot, _ ->
                    val config = snapshot?.data
                    val json = JSONObject(config ?: emptyMap<String, Any?>()).toString()
                    runJs("window.onGlobalPlannerConfig && window.onGlobalPlannerConfig(${JSONObject.quote(json)})")
                }
            var firstSnapshot = true
            plannerListener = database.collection("users").document(uid)
                .addSnapshotListener { snapshot, error ->
                    if (error != null) {
                        reportAuthError(error)
                        return@addSnapshotListener
                    }
                    val plannerJson = snapshot?.getString("plannerJson")
                    if (snapshot?.getBoolean("disabled") == true) {
                        plannerListener?.remove()
                        plannerListener = null
                        auth.signOut()
                        runJs("window.onFirebaseSuspended && window.onFirebaseSuspended()")
                        return@addSnapshotListener
                    }
                    val emailJs = JSONObject.quote(email.orEmpty())
                    val dataJs = if (plannerJson == null) "null" else JSONObject.quote(plannerJson)
                    if (firstSnapshot) {
                        firstSnapshot = false
                        runJs("window.onFirebaseLoginResult && window.onFirebaseLoginResult(true, $emailJs, $dataJs)")
                    } else if (plannerJson != null) {
                        runJs("window.onFirebaseCloudData && window.onFirebaseCloudData($dataJs)")
                    }
                }
        }

        private fun reportAuthError(error: Exception) {
            val message = error.localizedMessage?.takeIf { it.isNotBlank() }
                ?: "We couldn't sign you in. Check your email and password, then try again."
            runJs("window.onFirebaseLoginResult && window.onFirebaseLoginResult(false, '', ${JSONObject.quote(message)})")
        }

        private fun reportAdminError(message: String) {
            runJs("window.onAdminOperation && window.onAdminOperation(false, ${JSONObject.quote(message)})")
        }

        private fun reportAdminSuccess(message: String) {
            runJs("window.onAdminOperation && window.onAdminOperation(true, ${JSONObject.quote(message)})")
        }

        private fun runJs(script: String) {
            runOnUiThread { plannerView.evaluateJavascript(script, null) }
        }
    }

    @Deprecated("Use Activity Result APIs when this app adopts a newer activity base class")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == uploadRequestCode) {
            uploadFileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
            uploadFileCallback = null
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel("study_planner_reminders", "Study reminders", NotificationManager.IMPORTANCE_HIGH)
            channel.description = "Task reminders, focus timer alerts, and study alarms"
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    internal fun postNotification(title: String, body: String, notificationId: Int) {
        NotificationHelper.post(this, title, body, notificationId)
    }

    @Deprecated("Use the system back gesture; this override preserves in-app navigation.")
    override fun onBackPressed() {
        if (::plannerView.isInitialized && plannerView.canGoBack()) {
            plannerView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
