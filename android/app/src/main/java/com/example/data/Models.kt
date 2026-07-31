package com.example.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "profiles")
data class Profile(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String, // Selection name
    val charName: String = "",
    val charClass: String = "",
    val charRace: String = "",
    val charLevel: Int = 1,
    val charAlignment: String = "",
    val campaignName: String = "",
    
    // Gold stats
    val walletGold: Int = 0,
    val bankGold: Int = 0,
    val debtGold: Int = 0,
    val otherCurrencyNote: String = "",
    
    // Core attributes
    val armorClass: Int = 10,
    val speed: Int = 30,
    val initiative: Int = 0,
    val hpCurrent: Int = 10,
    val hpMax: Int = 10,
    
    val strength: Int = 10,
    val dexterity: Int = 10,
    val constitution: Int = 10,
    val intelligence: Int = 10,
    val wisdom: Int = 10,
    val charisma: Int = 10,
    
    // Campaign note
    val campaignNotes: String = "",
    
    // DM & Cloud Settings
    val dmName: String = "",
    val campaignCode: String = "",
    val playerNick: String = ""
)

@Entity(tableName = "features_feats")
data class FeatureFeat(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val profileId: Long,
    val title: String,
    val description: String,
    val sortOrder: Int = 0,
    val isExpanded: Boolean = true
)

@Entity(tableName = "inventory_items")
data class InventoryItem(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val profileId: Long,
    val name: String,
    val quantity: Int = 1,
    val weight: Double = 0.0,
    val value: Int = 0,
    val notes: String = "",
    val sortOrder: Int = 0
)

@Entity(tableName = "equipped_items")
data class EquippedItem(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val profileId: Long,
    val slot: String, // "Оружие 1", "Оружие 2", "Доспех", etc.
    val name: String,
    val notes: String = "",
    val sortOrder: Int = 0
)

@Entity(tableName = "npc_characters")
data class NpcCharacter(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val profileId: Long,
    val name: String,
    val role: String = "",
    val faction: String = "",
    val location: String = "",
    val relationship: String = "Дружел.", // Дружел., Нейтр., Враждеб.
    val tags: String = "",
    val notes: String = ""
)

@Entity(tableName = "quests")
data class Quest(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val profileId: Long,
    val name: String,
    val type: String = "", // Сюжет / побочка
    val description: String = "",
    val status: String = "Активный" // Активный, Завершённый, Проваленный
)

@Entity(tableName = "potions")
data class Potion(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val profileId: Long,
    val name: String,
    val quantity: Int = 1,
    val description: String = "",
    val sortOrder: Int = 0
)

@Entity(tableName = "consumables")
data class Consumable(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val profileId: Long,
    val name: String,
    val quantity: Int = 1,
    val description: String = "",
    val sortOrder: Int = 0
)

@Entity(tableName = "dice_roll_logs")
data class DiceRollLog(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val profileId: Long,
    val timestamp: Long = System.currentTimeMillis(),
    val notation: String,
    val resultsText: String,
    val finalResult: Int
)
