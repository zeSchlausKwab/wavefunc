package live.wavefunc.app

import android.os.Bundle
import android.view.View
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    // A WebView does not expose CSS safe-area insets consistently on older
    // Android versions. Apply the native system-bar and cutout insets to its
    // root instead so fixed player controls remain tappable in both gesture
    // and three-button navigation modes.
    val content = findViewById<View>(android.R.id.content)
    val initialLeft = content.paddingLeft
    val initialTop = content.paddingTop
    val initialRight = content.paddingRight
    val initialBottom = content.paddingBottom

    ViewCompat.setOnApplyWindowInsetsListener(content) { view, windowInsets ->
      val safeInsets = windowInsets.getInsets(
        WindowInsetsCompat.Type.systemBars() or
          WindowInsetsCompat.Type.displayCutout()
      )
      view.setPadding(
        initialLeft + safeInsets.left,
        initialTop + safeInsets.top,
        initialRight + safeInsets.right,
        initialBottom + safeInsets.bottom,
      )
      WindowInsetsCompat.CONSUMED
    }
    ViewCompat.requestApplyInsets(content)
  }
}
