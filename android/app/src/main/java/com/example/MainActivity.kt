package com.example

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.ui.DndMainScreen
import com.example.ui.DndViewModel
import com.example.ui.theme.MyApplicationTheme
import java.io.PrintWriter
import java.io.StringWriter

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    val oldHandler = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
      try {
        val sw = StringWriter()
        val pw = PrintWriter(sw)
        throwable.printStackTrace(pw)
        val stackTrace = sw.toString()
        getSharedPreferences("crash_prefs", MODE_PRIVATE)
          .edit()
          .putString("last_crash", stackTrace)
          .commit()
      } catch (e: Exception) {
        e.printStackTrace()
      }
      oldHandler?.uncaughtException(thread, throwable)
    }

    super.onCreate(savedInstanceState)
    enableEdgeToEdge()
    setContent {
      MyApplicationTheme {
        val viewModel: DndViewModel = viewModel()
        DndMainScreen(viewModel = viewModel)
      }
    }
  }
}
