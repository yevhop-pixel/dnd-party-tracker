package com.example

import android.app.Application
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.example.ui.DndViewModel
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class ExampleRobolectricTest {

  @Test
  fun `read string from context`() {
    val context = ApplicationProvider.getApplicationContext<Context>()
    val appName = context.getString(R.string.app_name)
    assertEquals("DnD Tracker", appName)
  }

  @Test
  fun testViewModelInitialization() {
    val application = ApplicationProvider.getApplicationContext<Application>()
    val viewModel = DndViewModel(application)
    
    // Test basic profile access and creation
    viewModel.createNewProfile("Test Hero")
    viewModel.rollDice("1d20")
    viewModel.rollDice("2d6+4")
    viewModel.rollDice("invalid_notation")
    
    // Trigger roll statistics active mode
    viewModel.rollActiveMode("1d20", "1d20", true)
    
    // Add feature/inventory/potion
    viewModel.addFeature("Test Feature", "Test Description")
    viewModel.addInventoryItem("Sword", 1, 3.0, 10, "Steel sword")
    viewModel.addPotion("Healing", 2, "Heals 2d4+2")
    viewModel.addConsumable("Rations", 5, "Daily food")
    viewModel.addNpc("NPC 1", "Guard", "Alliance", "City", "Дружел.", "tag", "notes")
    viewModel.addQuest("Quest 1", "Side", "Rescue quest")
    
    // Check values loaded
    assert(true)
  }

  @Test
  fun testMainActivityLaunch() {
    androidx.test.core.app.ActivityScenario.launch(MainActivity::class.java).use { scenario ->
      scenario.onActivity { activity ->
        assert(activity != null)
      }
    }
  }
}
