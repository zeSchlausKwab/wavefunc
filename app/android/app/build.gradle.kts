import java.util.Properties

plugins {
    id("com.android.application")
    id("com.chaquo.python")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("keystore.properties")
if (keystorePropertiesFile.exists()) {
    keystorePropertiesFile.inputStream().use { keystoreProperties.load(it) }
}

android {
    namespace = "live.wavefunc.wavefunc_app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "live.wavefunc.app"
        minSdk = 24
        ndk { abiFilters += listOf("armeabi-v7a", "arm64-v8a", "x86_64") }
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    // The APK's QuickJS executable must be extracted to the native library directory.
    packaging.jniLibs.useLegacyPackaging = true

    signingConfigs {
        if (keystorePropertiesFile.exists()) {
            create("release") {
                val storePath = keystoreProperties.getProperty("storeFile")
                if (!storePath.isNullOrBlank()) {
                    storeFile = rootProject.file(storePath)
                }
                storePassword = keystoreProperties.getProperty("storePassword")
                    ?: keystoreProperties.getProperty("password")
                keyAlias = keystoreProperties.getProperty("keyAlias") ?: "wavefunc"
                keyPassword = keystoreProperties.getProperty("keyPassword")
                    ?: keystoreProperties.getProperty("password")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = if (keystorePropertiesFile.exists()) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }
}

chaquopy {
    defaultConfig {
        // 3.11 is supported by yt-dlp and still ships an armeabi-v7a interpreter.
        version = "3.11"
        pip {
            install("yt-dlp==2026.11.23")
            install("yt-dlp-ejs==0.8.0")
        }
    }
}

val quickJsOutput = layout.buildDirectory.dir("generated/quickjs/jniLibs")
val quickJsScript = rootProject.file("../../scripts/build_android_quickjs.py")
val quickJsNdk = androidComponents.sdkComponents.ndkDirectory
val buildQuickJs by tasks.registering(Exec::class) {
    inputs.file(quickJsScript)
    inputs.file(quickJsNdk.map { it.file("source.properties") })
    outputs.dir(quickJsOutput)
    doFirst {
        commandLine("python3", quickJsScript, quickJsNdk.get().asFile, quickJsOutput.get().asFile)
    }
}
android.sourceSets.getByName("main").jniLibs.srcDir(quickJsOutput.get().asFile)
tasks.named("preBuild").configure { dependsOn(buildQuickJs) }

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
