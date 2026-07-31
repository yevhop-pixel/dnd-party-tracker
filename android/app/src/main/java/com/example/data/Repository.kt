package com.example.data

import kotlinx.coroutines.flow.Flow

class Repository(private val dndDao: DndDao) {

    // --- PROFILES ---
    val allProfiles: Flow<List<Profile>> = dndDao.getAllProfilesFlow()

    suspend fun getProfileById(id: Long): Profile? = dndDao.getProfileById(id)

    suspend fun insertProfile(profile: Profile): Long = dndDao.insertProfile(profile)

    suspend fun updateProfile(profile: Profile) = dndDao.updateProfile(profile)

    suspend fun deleteProfile(profile: Profile) = dndDao.deleteProfile(profile)

    suspend fun deleteProfileById(id: Long) = dndDao.deleteProfileById(id)

    // --- FEATURES & FEATS ---
    fun getFeaturesForProfile(profileId: Long): Flow<List<FeatureFeat>> =
        dndDao.getFeaturesByProfileFlow(profileId)

    suspend fun insertFeature(feat: FeatureFeat): Long = dndDao.insertFeature(feat)

    suspend fun updateFeature(feat: FeatureFeat) = dndDao.updateFeature(feat)

    suspend fun deleteFeature(feat: FeatureFeat) = dndDao.deleteFeature(feat)

    suspend fun deleteFeatureById(id: Long) = dndDao.deleteFeatureById(id)

    // --- INVENTORY ---
    fun getInventoryForProfile(profileId: Long): Flow<List<InventoryItem>> =
        dndDao.getInventoryByProfileFlow(profileId)

    suspend fun insertInventoryItem(item: InventoryItem): Long = dndDao.insertInventoryItem(item)

    suspend fun updateInventoryItem(item: InventoryItem) = dndDao.updateInventoryItem(item)

    suspend fun deleteInventoryItem(item: InventoryItem) = dndDao.deleteInventoryItem(item)

    suspend fun deleteInventoryItemById(id: Long) = dndDao.deleteInventoryItemById(id)

    // --- EQUIPPED ---
    fun getEquippedForProfile(profileId: Long): Flow<List<EquippedItem>> =
        dndDao.getEquippedByProfileFlow(profileId)

    suspend fun insertEquippedItem(item: EquippedItem): Long = dndDao.insertEquippedItem(item)

    suspend fun updateEquippedItem(item: EquippedItem) = dndDao.updateEquippedItem(item)

    suspend fun deleteEquippedItem(item: EquippedItem) = dndDao.deleteEquippedItem(item)

    suspend fun deleteEquippedItemById(id: Long) = dndDao.deleteEquippedItemById(id)

    // --- NPCs ---
    fun getNpcsForProfile(profileId: Long): Flow<List<NpcCharacter>> =
        dndDao.getNpcsByProfileFlow(profileId)

    suspend fun insertNpc(npc: NpcCharacter): Long = dndDao.insertNpc(npc)

    suspend fun updateNpc(npc: NpcCharacter) = dndDao.updateNpc(npc)

    suspend fun deleteNpc(npc: NpcCharacter) = dndDao.deleteNpc(npc)

    suspend fun deleteNpcById(id: Long) = dndDao.deleteNpcById(id)

    // --- QUESTS ---
    fun getQuestsForProfile(profileId: Long): Flow<List<Quest>> =
        dndDao.getQuestsByProfileFlow(profileId)

    suspend fun insertQuest(quest: Quest): Long = dndDao.insertQuest(quest)

    suspend fun updateQuest(quest: Quest) = dndDao.updateQuest(quest)

    suspend fun deleteQuest(quest: Quest) = dndDao.deleteQuest(quest)

    suspend fun deleteQuestById(id: Long) = dndDao.deleteQuestById(id)

    // --- POTIONS ---
    fun getPotionsForProfile(profileId: Long): Flow<List<Potion>> =
        dndDao.getPotionsByProfileFlow(profileId)

    suspend fun insertPotion(potion: Potion): Long = dndDao.insertPotion(potion)

    suspend fun updatePotion(potion: Potion) = dndDao.updatePotion(potion)

    suspend fun deletePotion(potion: Potion) = dndDao.deletePotion(potion)

    suspend fun deletePotionById(id: Long) = dndDao.deletePotionById(id)

    // --- CONSUMABLES ---
    fun getConsumablesForProfile(profileId: Long): Flow<List<Consumable>> =
        dndDao.getConsumablesByProfileFlow(profileId)

    suspend fun insertConsumable(item: Consumable): Long = dndDao.insertConsumable(item)

    suspend fun updateConsumable(item: Consumable) = dndDao.updateConsumable(item)

    suspend fun deleteConsumable(item: Consumable) = dndDao.deleteConsumable(item)

    suspend fun deleteConsumableById(id: Long) = dndDao.deleteConsumableById(id)

    // --- DICE LOGS ---
    fun getDiceLogsForProfile(profileId: Long): Flow<List<DiceRollLog>> =
        dndDao.getDiceLogsByProfileFlow(profileId)

    suspend fun insertDiceLog(log: DiceRollLog): Long = dndDao.insertDiceLog(log)

    suspend fun clearDiceLogsForProfile(profileId: Long) = dndDao.clearDiceLogsByProfile(profileId)
}
