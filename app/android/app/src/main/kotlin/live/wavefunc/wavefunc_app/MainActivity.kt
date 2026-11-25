package live.wavefunc.wavefunc_app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import com.ryanheise.audioservice.AudioServiceActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/**
 * Main Flutter activity combining:
 * 1. `AudioServiceActivity` for background MediaSession / ExoPlayer playback.
 * 2. Native NIP-55 Android external signer bridge (`live.wavefunc.app/amber`)
 *    for Amber and compatible Nostr signer apps.
 */
class MainActivity : AudioServiceActivity() {
    companion object {
        private const val AMBER_CHANNEL = "live.wavefunc.app/amber"
        private const val REQ_GET_PUBKEY = 5501
        private const val REQ_SIGN_EVENT = 5502
        private const val REQ_NIP44_DECRYPT = 5503
        private const val REQ_NIP44_ENCRYPT = 5504
    }

    private var pendingResult: MethodChannel.Result? = null
    private var pendingRequestCode: Int = 0
    private var pendingUnsignedEventJson: String? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        registerMediaDownloader(applicationContext, flutterEngine.dartExecutor.binaryMessenger)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, AMBER_CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "isAvailable" -> {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("nostrsigner:"))
                        val resolved = packageManager.queryIntentActivities(intent, 0)
                        result.success(resolved.isNotEmpty())
                    }

                    "getPublicKey" -> {
                        if (pendingResult != null) {
                            result.error("BUSY", "Another signer request is already in progress.", null)
                            return@setMethodCallHandler
                        }
                        val permissions = call.argument<String>("permissions")
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("nostrsigner:")).apply {
                            putExtra("type", "get_public_key")
                            if (!permissions.isNullOrBlank()) {
                                putExtra("permissions", permissions)
                            }
                        }
                        if (intent.resolveActivity(packageManager) == null) {
                            result.error("NO_SIGNER", "No NIP-55 signer app (such as Amber) is installed.", null)
                            return@setMethodCallHandler
                        }
                        pendingResult = result
                        pendingRequestCode = REQ_GET_PUBKEY
                        startActivityForResult(intent, REQ_GET_PUBKEY)
                    }

                    "signEvent" -> {
                        if (pendingResult != null) {
                            result.error("BUSY", "Another signer request is already in progress.", null)
                            return@setMethodCallHandler
                        }
                        val eventJson = call.argument<String>("eventJson")
                        if (eventJson.isNullOrBlank()) {
                            result.error("INVALID_ARGS", "Missing unsigned event JSON.", null)
                            return@setMethodCallHandler
                        }
                        val currentUser = call.argument<String>("currentUser")
                        val signerPackage = call.argument<String>("signerPackage")
                        val intent = Intent(
                            Intent.ACTION_VIEW,
                            Uri.parse("nostrsigner:${Uri.encode(eventJson)}"),
                        ).apply {
                            putExtra("type", "sign_event")
                            if (!currentUser.isNullOrBlank()) {
                                putExtra("current_user", currentUser)
                            }
                            if (!signerPackage.isNullOrBlank()) {
                                `package` = signerPackage
                            }
                        }
                        if (intent.resolveActivity(packageManager) == null) {
                            result.error("NO_SIGNER", "No NIP-55 signer app is available to sign this event.", null)
                            return@setMethodCallHandler
                        }
                        pendingResult = result
                        pendingRequestCode = REQ_SIGN_EVENT
                        pendingUnsignedEventJson = eventJson
                        startActivityForResult(intent, REQ_SIGN_EVENT)
                    }

                    "nip44Decrypt", "nip44Encrypt" -> {
                        val isDecrypt = call.method == "nip44Decrypt"
                        val payload = call.argument<String>("payload")
                        val pubkey = call.argument<String>("pubkey")
                        val currentUser = call.argument<String>("currentUser")
                        val signerPackage = call.argument<String>("signerPackage")
                        if (payload.isNullOrBlank() || pubkey.isNullOrBlank()) {
                            result.error("INVALID_ARGS", "Missing payload or pubkey.", null)
                            return@setMethodCallHandler
                        }

                        // Try silent NIP-55 ContentProvider first (no UI interruption if approved).
                        val providerMethod = if (isDecrypt) "NIP44_DECRYPT" else "NIP44_ENCRYPT"
                        val pkg = if (!signerPackage.isNullOrBlank()) signerPackage else "com.greenart7c3.nostrsigner"
                        val silent = tryAmberContentProvider(
                            signerPackage = pkg,
                            method = providerMethod,
                            args = arrayOf(payload, pubkey, currentUser ?: pubkey),
                        )
                        if (silent != null) {
                            result.success(silent)
                            return@setMethodCallHandler
                        }

                        if (pendingResult != null) {
                            result.error("BUSY", "Another signer request is already in progress.", null)
                            return@setMethodCallHandler
                        }
                        val intent = Intent(
                            Intent.ACTION_VIEW,
                            Uri.parse("nostrsigner:${Uri.encode(payload)}"),
                        ).apply {
                            putExtra("type", if (isDecrypt) "nip44_decrypt" else "nip44_encrypt")
                            putExtra("pubKey", pubkey)
                            if (!currentUser.isNullOrBlank()) {
                                putExtra("current_user", currentUser)
                            }
                            if (!signerPackage.isNullOrBlank()) {
                                `package` = signerPackage
                            }
                        }
                        if (intent.resolveActivity(packageManager) == null) {
                            result.error("NO_SIGNER", "No NIP-55 signer app is available for NIP-44.", null)
                            return@setMethodCallHandler
                        }
                        val reqCode = if (isDecrypt) REQ_NIP44_DECRYPT else REQ_NIP44_ENCRYPT
                        pendingResult = result
                        pendingRequestCode = reqCode
                        startActivityForResult(intent, reqCode)
                    }

                    else -> result.notImplemented()
                }
            }
    }

    private fun tryAmberContentProvider(
        signerPackage: String,
        method: String,
        args: Array<String>,
    ): String? {
        return try {
            val uri = Uri.parse("content://$signerPackage.$method")
            contentResolver.query(uri, args, null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val rejectedIdx = cursor.getColumnIndex("rejected")
                    if (rejectedIdx >= 0 && cursor.getString(rejectedIdx) != null) {
                        return null
                    }
                    val idx = cursor.getColumnIndex("result").takeIf { it >= 0 }
                        ?: cursor.getColumnIndex("signature").takeIf { it >= 0 }
                        ?: 0
                    cursor.getString(idx)?.takeIf { it.isNotBlank() }
                } else {
                    null
                }
            }
        } catch (_: Exception) {
            null
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == pendingRequestCode && pendingResult != null) {
            val callback = pendingResult!!
            pendingResult = null
            pendingRequestCode = 0

            if (resultCode != Activity.RESULT_OK || data == null) {
                callback.error("CANCELLED", "Signer request was cancelled.", null)
                return
            }

            when (requestCode) {
                REQ_GET_PUBKEY -> {
                    val pubkey = data.getStringExtra("result")
                        ?: data.getStringExtra("signature")
                    val pkg = data.getStringExtra("package")
                    if (pubkey.isNullOrBlank()) {
                        callback.error("EMPTY_RESULT", "Amber did not return a public key.", null)
                    } else {
                        callback.success(mapOf("pubkey" to pubkey, "package" to pkg))
                    }
                }

                REQ_SIGN_EVENT -> {
                    val eventExtra = data.getStringExtra("event")?.trim()
                    val sigExtra = (data.getStringExtra("signature")
                        ?: data.getStringExtra("result"))?.trim()
                    val unsignedJson = pendingUnsignedEventJson
                    pendingUnsignedEventJson = null

                    val signedEvent = when {
                        !eventExtra.isNullOrBlank() && eventExtra.startsWith("{") -> eventExtra
                        !sigExtra.isNullOrBlank() && sigExtra.startsWith("{") -> sigExtra
                        !sigExtra.isNullOrBlank() && !unsignedJson.isNullOrBlank() -> {
                            try {
                                val obj = org.json.JSONObject(unsignedJson)
                                obj.put("sig", sigExtra)
                                obj.toString()
                            } catch (_: Exception) {
                                null
                            }
                        }
                        else -> null
                    }
                    if (signedEvent.isNullOrBlank()) {
                        callback.error("EMPTY_RESULT", "Amber did not return a signed event.", null)
                    } else {
                        callback.success(signedEvent)
                    }
                }

                REQ_NIP44_DECRYPT, REQ_NIP44_ENCRYPT -> {
                    val out = (data.getStringExtra("result")
                        ?: data.getStringExtra("signature"))?.trim()
                    if (out.isNullOrBlank()) {
                        callback.error("EMPTY_RESULT", "Amber did not return a NIP-44 result.", null)
                    } else {
                        callback.success(out)
                    }
                }
            }
            return
        }
        super.onActivityResult(requestCode, resultCode, data)
    }
}
