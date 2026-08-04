import java.net.URI
import java.security.MessageDigest
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

// youtubedl-android 0.18.1 ships yt-dlp 2025.11.12, which YouTube now
// rejects with HTTP 403 for some otherwise public media URLs. Override only
// the zipapp resource with a current, checksum-pinned upstream stable build;
// the Android/Python/ffmpeg wrapper remains supplied by the Maven dependency.
val bundledYtDlpVersion = "2026.07.04"
val bundledYtDlpSha256 = "495be29ff4d9d4e9be7eabdfef225221e5d5282e77f2f505abc6dca80349f3fd"
val bundledYtDlpResDir = layout.buildDirectory.dir("generated/wavefunc-ytdlp/res")
val bundledYtDlpFile = bundledYtDlpResDir.map { it.file("raw/ytdlp") }
val youtubedlAndroidLicenseSha256 =
    "3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986"
val generatedLicenseAssetsDir =
    layout.buildDirectory.dir("generated/wavefunc-licenses/assets")
val youtubedlAndroidLicenseFile = generatedLicenseAssetsDir.map {
    it.file("licenses/GPL-3.0-youtubedl-android.txt")
}

fun File.sha256(): String {
    val digest = MessageDigest.getInstance("SHA-256")
    inputStream().buffered().use { input ->
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            digest.update(buffer, 0, read)
        }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
}

val prepareBundledYtDlp by tasks.registering {
    outputs.file(bundledYtDlpFile)

    doLast {
        val output = bundledYtDlpFile.get().asFile
        if (output.isFile && output.sha256() == bundledYtDlpSha256) return@doLast

        output.parentFile.mkdirs()
        val temporary = output.resolveSibling("${output.name}.download")
        URI(
            "https://github.com/yt-dlp/yt-dlp/releases/download/" +
                "$bundledYtDlpVersion/yt-dlp",
        ).toURL().openStream().buffered().use { input ->
            temporary.outputStream().buffered().use { target -> input.copyTo(target) }
        }

        val actualHash = temporary.sha256()
        check(actualHash == bundledYtDlpSha256) {
            "yt-dlp $bundledYtDlpVersion checksum mismatch: $actualHash"
        }
        temporary.copyTo(output, overwrite = true)
        check(temporary.delete()) { "Could not remove temporary yt-dlp download." }
    }
}

val prepareYoutubedlAndroidLicense by tasks.registering {
    outputs.file(youtubedlAndroidLicenseFile)

    doLast {
        val output = youtubedlAndroidLicenseFile.get().asFile
        if (output.isFile && output.sha256() == youtubedlAndroidLicenseSha256) {
            return@doLast
        }

        output.parentFile.mkdirs()
        val temporary = output.resolveSibling("${output.name}.download")
        URI(
            "https://raw.githubusercontent.com/yausername/youtubedl-android/0.18.1/LICENSE",
        ).toURL().openStream().buffered().use { input ->
            temporary.outputStream().buffered().use { target -> input.copyTo(target) }
        }

        val actualHash = temporary.sha256()
        check(actualHash == youtubedlAndroidLicenseSha256) {
            "youtubedl-android license checksum mismatch: $actualHash"
        }
        temporary.copyTo(output, overwrite = true)
        check(temporary.delete()) { "Could not remove temporary license download." }
    }
}

android {
    namespace = "live.wavefunc.media"
    compileSdk = 36

    defaultConfig {
        minSdk = 24
        consumerProguardFiles("consumer-rules.pro")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    sourceSets.named("main") {
        res.srcDir(bundledYtDlpResDir)
        assets.srcDir(generatedLicenseAssetsDir)
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(project(":tauri-android"))
    implementation("androidx.core:core-ktx:1.17.0")

    // Embeds yt-dlp, Python, QuickJS and ffmpeg for local Android downloads.
    // youtubedl-android is GPL-3.0. Its license is packaged in the APK and the
    // release workflow publishes the matching upstream source archive.
    implementation("io.github.junkfood02.youtubedl-android:library:0.18.1")
    implementation("io.github.junkfood02.youtubedl-android:ffmpeg:0.18.1")
}

tasks.named("preBuild") {
    dependsOn(prepareBundledYtDlp, prepareYoutubedlAndroidLicense)
}
