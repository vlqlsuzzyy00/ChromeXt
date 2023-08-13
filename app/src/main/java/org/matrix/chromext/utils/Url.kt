package org.matrix.chromext.utils

import android.net.Uri
import android.provider.OpenableColumns
import kotlin.text.Regex
import org.matrix.chromext.Chrome
import org.matrix.chromext.script.Script

const val ERUD_URL = "https://cdn.jsdelivr.net/npm/eruda"
private const val DEV_FRONT_END = "https://chrome-devtools-frontend.appspot.com"

private fun urlMatch(match: String, url: String, strict: Boolean): Boolean {
  var pattern = match
  val regexPattern = pattern.startsWith("/") && pattern.endsWith("/")

  if (regexPattern) {
    pattern = pattern.removeSurrounding("/", "/")
  } else if ("*" !in pattern) {
    if (strict) {
      return pattern == url
    } else {
      return pattern in url
    }
  } else if ("://" in pattern || strict) {
    pattern = pattern.replace("?", "\\?")
    pattern = pattern.replace(".", "\\.")
    pattern = pattern.replace("*", "[^:]*")
    pattern = pattern.replace("[^:]*\\.", "([^:]*\\.)?")
  } else {
    return false
  }

  runCatching {
        val result = Regex(pattern).matches(url)
        // Log.d("Matching ${pattern} against ${url}: ${result}")
        return result
      }
      .onFailure { Log.i("Invaid matching rule: ${match}, error: " + it.message) }
  return false
}

fun matching(script: Script, url: String): Boolean {
  if (!url.startsWith("http")) {
    return false
  }

  script.exclude.forEach {
    if (urlMatch(it, url, true)) {
      return false
    }
  }
  script.match.forEach {
    if (urlMatch(it, url, false)) {
      // Log.d("${script.id} injected")
      return true
    }
  }
  return false
}

fun isDevToolsFrontEnd(url: String?): Boolean {
  if (url == null) return false
  return url.startsWith(DEV_FRONT_END)
}

fun isUserScript(url: String?): Boolean {
  if (url == null) return false
  if (url.endsWith(".user.js")) {
    return true
  } else if (url.startsWith("content://")) {
    Chrome.getContext().contentResolver.query(Uri.parse(url), null, null, null, null)?.use { cursor
      ->
      cursor.moveToFirst()
      val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
      val filename = cursor.getString(nameIndex)
      if (filename.endsWith(".js")) {
        return true
      }
    }
  }
  return false
}

val trustedHosts = listOf("jingmatrix.github.io", "jianyu-ma.onrender.com", "jianyu-ma.netlify.app")

fun isChromeXtFrontEnd(url: String?): Boolean {
  if (url == null || !url.endsWith("/ChromeXt/")) return false
  trustedHosts.forEach { if (url == "https://" + it + "/ChromeXt/") return true }
  return false
}

fun parseOrigin(url: String): String? {
  val protocol = url.split("://")
  if (protocol.size > 1 && arrayOf("https", "http", "file").contains(protocol.first())) {
    return protocol.first() + "://" + protocol[1].split("/").first()
  } else {
    return null
  }
}