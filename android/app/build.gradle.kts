plugins {
    id("com.android.application")
    id("com.google.gms.google-services")
}

android {
    namespace = "com.studyplanner.app"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.studyplanner.app"
        minSdk = 23
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation(platform("com.google.firebase:firebase-bom:34.19.0"))
    implementation("com.google.firebase:firebase-auth")
    implementation("com.google.firebase:firebase-firestore")
}
