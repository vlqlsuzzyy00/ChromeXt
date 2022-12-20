package org.matrix.chromext

import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.os.Bundle

private const val TAG = "ChromeXt"

class OpenInChrome : Activity() {

  fun convertToFileUrl(url: String): String? {
    return null
  }

  fun invokeChromeTabbed(url: String) {
    val chromeMain =
        Intent(Intent.ACTION_MAIN)
            .setComponent(
                ComponentName("com.android.chrome", "com.google.android.apps.chrome.Main"))
    // Ensure that Chrome is started
    startActivity(chromeMain)
    startActivity(chromeMain.putExtra("ChromeXt", url))
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val intent: Intent = getIntent()
    val destination: ComponentName =
        ComponentName("com.android.chrome", "com.google.android.apps.chrome.IntentDispatcher")
    intent.setComponent(destination)
    if (intent.action == Intent.ACTION_VIEW) {
      val fileUrl = convertToFileUrl(intent.getData().toString())
      if (fileUrl == null) {
        intent.setDataAndType(intent.getData(), "text/html")
        startActivity(intent)
      } else {
        invokeChromeTabbed(fileUrl)
      }
    } else if (intent.action == Intent.ACTION_SEND) {
      var text = intent.getStringExtra(Intent.EXTRA_TEXT)
      if (text != null) {
        if (text.startsWith("file://")) {
          invokeChromeTabbed(text)
        } else {
          if (!text.contains("://")) {
            text = "https://google.com/search?q=${text}"
          }
          startActivity(
              Intent().apply {
                action = Intent.ACTION_VIEW
                data = Uri.parse(text)
                component = destination
              })
        }
      }
    }
    finish()
  }
}