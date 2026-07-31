package com.example.data

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Dao
interface DndDao {

    // --- PROFILES ---
    @Query("SELECT * FROM profiles ORDER BY id DESC")
    fun getAllProfilesFlow(): Flow<List<Profile>>

    @Query("SELECT * FROM profiles WHERE id = :id")
    suspend fun getProfileById(id: Long): Profile?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertProfile(profile: Profile): Long

    @Update
    suspend fun updateProfile(profile: Profile)

    @Delete
    suspend fun deleteProfile(profile: Profile)

    @Query("DELETE FROM profiles WHERE id = :id")
    suspend fun deleteProfileById(id: Long)

    // --- FEATURES & FEATS ---
    @Query("SELECT * FROM features_feats WHERE profileId = :profileId ORDER BY sortOrder ASC, id ASC")
    fun getFeaturesByProfileFlow(profileId: Long): Flow<List<FeatureFeat>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertFeature(feat: FeatureFeat): Long

    @Update
    suspend fun updateFeature(feat: FeatureFeat)

    @Delete
    suspend fun deleteFeature(feat: FeatureFeat)

    @Query("DELETE FROM features_feats WHERE id = :id")
    suspend fun deleteFeatureById(id: Long)

    // --- INVENTORY ---
    @Query("SELECT * FROM inventory_items WHERE profileId = :profileId ORDER BY sortOrder ASC, id ASC")
    fun getInventoryByProfileFlow(profileId: Long): Flow<List<InventoryItem>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertInventoryItem(item: InventoryItem): Long

    @Update
    suspend fun updateInventoryItem(item: InventoryItem)

    @Delete
    suspend fun deleteInventoryItem(item: InventoryItem)

    @Query("DELETE FROM inventory_items WHERE id = :id")
    suspend fun deleteInventoryItemById(id: Long)

    // --- EQUIPPED ITEMS ---
    @Query("SELECT * FROM equipped_items WHERE profileId = :profileId ORDER BY sortOrder ASC, id ASC")
    fun getEquippedByProfileFlow(profileId: Long): Flow<List<EquippedItem>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertEquippedItem(item: EquippedItem): Long

    @Update
    suspend fun updateEquippedItem(item: EquippedItem)

    @Delete
    suspend fun deleteEquippedItem(item: EquippedItem)

    @Query("DELETE FROM equipped_items WHERE id = :id")
    suspend fun deleteEquippedItemById(id: Long)

    // --- NPC / CHARACTERS ---
    @Query("SELECT * FROM npc_characters WHERE profileId = :profileId ORDER BY id DESC")
    fun getNpcsByProfileFlow(profileId: Long): Flow<List<NpcCharacter>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertNpc(npc: NpcCharacter): Long

    @Update
    suspend fun updateNpc(npc: NpcCharacter)

    @Delete
    suspend fun deleteNpc(npc: NpcCharacter)

    @Query("DELETE FROM npc_characters WHERE id = :id")
    suspend fun deleteNpcById(id: Long)

    // --- QUESTS ---
    @Query("SELECT * FROM quests WHERE profileId = :profileId ORDER BY id DESC")
    fun getQuestsByProfileFlow(profileId: Long): Flow<List<Quest>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertQuest(quest: Quest): Long

    @Update
    suspend fun updateQuest(quest: Quest)

    @Delete
    suspend fun deleteQuest(quest: Quest)

    @Query("DELETE FROM quests WHERE id = :id")
    suspend fun deleteQuestById(id: Long)

    // --- POTIONS ---
    @Query("SELECT * FROM potions WHERE profileId = :profileId ORDER BY sortOrder ASC, id ASC")
    fun getPotionsByProfileFlow(profileId: Long): Flow<List<Potion>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertPotion(potion: Potion): Long

    @Update
    suspend fun updatePotion(potion: Potion)

    @Delete
    suspend fun deletePotion(potion: Potion)

    @Query("DELETE FROM potions WHERE id = :id")
    suspend fun deletePotionById(id: Long)

    // --- CONSUMABLES ---
    @Query("SELECT * FROM consumables WHERE profileId = :profileId ORDER BY sortOrder ASC, id ASC")
    fun getConsumablesByProfileFlow(profileId: Long): Flow<List<Consumable>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertConsumable(item: Consumable): Long

    @Update
    suspend fun updateConsumable(item: Consumable)

    @Delete
    suspend fun deleteConsumable(item: Consumable)

    @Query("DELETE FROM consumables WHERE id = :id")
    suspend fun deleteConsumableById(id: Long)

    // --- DICE ROLL LOGS ---
    @Query("SELECT * FROM dice_roll_logs WHERE profileId = :profileId ORDER BY timestamp DESC, id DESC LIMIT 50")
    fun getDiceLogsByProfileFlow(profileId: Long): Flow<List<DiceRollLog>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertDiceLog(log: DiceRollLog): Long

    @Query("DELETE FROM dice_roll_logs WHERE profileId = :profileId")
    suspend fun clearDiceLogsByProfile(profileId: Long)
}
