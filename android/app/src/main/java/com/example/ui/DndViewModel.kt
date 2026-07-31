package com.example.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.data.*
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.*
import kotlin.random.Random

@OptIn(ExperimentalCoroutinesApi::class)
class DndViewModel(application: Application) : AndroidViewModel(application) {

    private val prefs = application.getSharedPreferences("dnd_prefs", android.content.Context.MODE_PRIVATE)
    val appLanguage = MutableStateFlow(prefs.getString("lang", "ru") ?: "ru")

    fun setLanguage(lang: String) {
        appLanguage.value = lang
        prefs.edit().putString("lang", lang).apply()
    }

    val collapsedItemIds = MutableStateFlow<Set<String>>(
        prefs.getStringSet("collapsed_items", emptySet())?.toSet() ?: emptySet()
    )

    fun toggleCollapsed(key: String) {
        val current = collapsedItemIds.value
        val updated = if (current.contains(key)) current - key else current + key
        collapsedItemIds.value = updated
        prefs.edit().putStringSet("collapsed_items", updated).apply()
    }

    fun collapseAll(keys: List<String>) {
        val current = collapsedItemIds.value.toMutableSet()
        current.addAll(keys)
        collapsedItemIds.value = current
        prefs.edit().putStringSet("collapsed_items", current).apply()
    }

    fun expandAll(keys: List<String>) {
        val current = collapsedItemIds.value.toMutableSet()
        current.removeAll(keys.toSet())
        collapsedItemIds.value = current
        prefs.edit().putStringSet("collapsed_items", current).apply()
    }

    private val repository: Repository

    private var updateProfileJob: kotlinx.coroutines.Job? = null
    private var updateGoldJob: kotlinx.coroutines.Job? = null
    private var updateStatsJob: kotlinx.coroutines.Job? = null
    private var updateNotesJob: kotlinx.coroutines.Job? = null
    private var updateSettingsJob: kotlinx.coroutines.Job? = null
    private val itemUpdateJobs = java.util.concurrent.ConcurrentHashMap<String, kotlinx.coroutines.Job>()

    // Profile list
    val allProfiles: StateFlow<List<Profile>>

    // Selected active Profile IDs
    private val _activeProfileId = MutableStateFlow<Long?>(null)
    val activeProfileId: StateFlow<Long?> = _activeProfileId.asStateFlow()

    // Active Profile details
    val currentProfile: StateFlow<Profile?>

    // Sub-lists reactively bound to selected profiles
    val currentFeatures: StateFlow<List<FeatureFeat>>
    val currentInventory: StateFlow<List<InventoryItem>>
    val currentEquipped: StateFlow<List<EquippedItem>>
    val currentNpcs: StateFlow<List<NpcCharacter>>
    val currentQuests: StateFlow<List<Quest>>
    val currentPotions: StateFlow<List<Potion>>
    val currentConsumables: StateFlow<List<Consumable>>
    val currentDiceLogs: StateFlow<List<DiceRollLog>>

    // Local state for UI operations
    val diceNotation1 = MutableStateFlow("1d20")
    val diceNotation2 = MutableStateFlow("1d8+3")
    val rollHistoryText = MutableStateFlow("")
    val activeRollMode = MutableStateFlow("Обычный") // Обычный, Преим., Помеха
    val lastRolledValue = MutableStateFlow(0)
    val lastRolledNotation = MutableStateFlow("d20")
    val activeRollTarget = MutableStateFlow(1) // 1 = 1-й, 2 = 2-й, 3 = Оба

    // Detailed states of the last roll for the UI to display rich result layouts
    val lastRollFirstVal = MutableStateFlow<Int?>(null)
    val lastRollSecondVal = MutableStateFlow<Int?>(null)
    val lastRollType = MutableStateFlow("") // "", "adv", "dis", "both"
    val lastRollChoice = MutableStateFlow(0) // 1 if first roll chosen, 2 if second, 0 for both/single
    val lastRollFirstDetail = MutableStateFlow("") // e.g. "4+2"
    val lastRollSecondDetail = MutableStateFlow("") // e.g. "3"
    val lastRollFirstNotation = MutableStateFlow("")
    val lastRollSecondNotation = MutableStateFlow("")

    init {
        val database = AppDatabase.getDatabase(application)
        repository = Repository(database.dndDao())

        allProfiles = repository.allProfiles
            .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

        // Reactively load current profile from database
        currentProfile = _activeProfileId.flatMapLatest { id ->
            if (id == null) {
                flowOf(null)
            } else {
                allProfiles.map { list -> list.find { it.id == id } }
            }
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

        // Reactively load features
        currentFeatures = _activeProfileId.flatMapLatest { id ->
            if (id == null) flowOf(emptyList()) else repository.getFeaturesForProfile(id)
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

        // Reactively load inventory
        currentInventory = _activeProfileId.flatMapLatest { id ->
            if (id == null) flowOf(emptyList()) else repository.getInventoryForProfile(id)
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

        // Reactively load equipped
        currentEquipped = _activeProfileId.flatMapLatest { id ->
            if (id == null) flowOf(emptyList()) else repository.getEquippedForProfile(id)
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

        // Reactively load NPCs
        currentNpcs = _activeProfileId.flatMapLatest { id ->
            if (id == null) flowOf(emptyList()) else repository.getNpcsForProfile(id)
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

        // Reactively load Quests
        currentQuests = _activeProfileId.flatMapLatest { id ->
            if (id == null) flowOf(emptyList()) else repository.getQuestsForProfile(id)
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

        // Reactively load Potions
        currentPotions = _activeProfileId.flatMapLatest { id ->
            if (id == null) flowOf(emptyList()) else repository.getPotionsForProfile(id)
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

        // Reactively load Consumables
        currentConsumables = _activeProfileId.flatMapLatest { id ->
            if (id == null) flowOf(emptyList()) else repository.getConsumablesForProfile(id)
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

        // Reactively load Dice Logs
        currentDiceLogs = _activeProfileId.flatMapLatest { id ->
            if (id == null) flowOf(emptyList()) else repository.getDiceLogsForProfile(id)
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

        // Seed check and initial selection
        viewModelScope.launch {
            val profiles = repository.allProfiles.first()
            if (profiles.isEmpty()) {
                seedDefaultData()
            } else {
                _activeProfileId.value = profiles.first().id
            }
        }
    }

    private suspend fun seedDefaultData() {
        val rootProfile = Profile(
            name = "Габен",
            charName = "Габен",
            charClass = "Следопыт",
            charRace = "Нигрит",
            charLevel = 2,
            charAlignment = "Андалусия",
            campaignName = "10 к для Фермы",
            walletGold = 386,
            bankGold = 0,
            debtGold = 0,
            otherCurrencyNote = "20 фан",
            armorClass = 10,
            speed = 30,
            initiative = 0,
            hpCurrent = 10,
            hpMax = 10,
            strength = 10,
            dexterity = 10,
            constitution = 10,
            intelligence = 10,
            wisdom = 10,
            charisma = 10,
            campaignNotes = "Записывай всё важное...",
            dmName = "Габен",
            campaignCode = "FANTASY-MAIN",
            playerNick = "Gaben"
        )
        val profileId = repository.insertProfile(rootProfile)
        _activeProfileId.value = profileId

        // Seed features
        val seedFeats = listOf(
            FeatureFeat(
                profileId = profileId,
                title = "Пассивка",
                description = "Друг животных\nПреимущества в лесах, водоемах и тд\n+1 д4 Под водой\n+1 д4 к атаке в повозках\n+1 д6 1 раз (Благословение кузнеца)\n+1 д6 1 раз (Благословение от Эндрю)",
                sortOrder = 0,
                isExpanded = true
            ),
            FeatureFeat(
                profileId = profileId,
                title = "Дебафы",
                description = "-1 д6 к Мантикорам\nМорская болезнь",
                sortOrder = 1,
                isExpanded = true
            ),
            FeatureFeat(
                profileId = profileId,
                title = "Мальчик",
                description = "+1 д4 к небоевым действиям собаки",
                sortOrder = 2,
                isExpanded = true
            ),
            FeatureFeat(
                profileId = profileId,
                title = "Елдак",
                description = "близко к 20 см",
                sortOrder = 3,
                isExpanded = true
            )
        )
        seedFeats.forEach { repository.insertFeature(it) }

        // Seed inventory
        repository.insertInventoryItem(InventoryItem(profileId = profileId, name = "Капкан", quantity = 3, weight = 0.0, value = 0, notes = "", sortOrder = 0))
        repository.insertInventoryItem(InventoryItem(profileId = profileId, name = "Кузнечный набор", quantity = 1, weight = 0.0, value = 0, notes = "", sortOrder = 1))
        repository.insertInventoryItem(InventoryItem(profileId = profileId, name = "Волшебный самогон Тра", quantity = 1, weight = 0.0, value = 0, notes = "0.5 л", sortOrder = 2))

        // Seed equipped items
        repository.insertEquippedItem(EquippedItem(profileId = profileId, slot = "Оружие 1", name = "Длинный лук", notes = "", sortOrder = 0))

        // Seed potion
        repository.insertPotion(Potion(profileId = profileId, name = "dhdhdhd", quantity = 1, description = "shdhdheheehehrh\ndhdhdhd", sortOrder = 0))

        // Seed initial roll
        repository.insertDiceLog(DiceRollLog(profileId = profileId, notation = "1d20", resultsText = "[13]", finalResult = 13))
    }

    // --- PROFILE ACTIONS ---
    fun selectProfile(id: Long) {
        _activeProfileId.value = id
    }

    fun createNewProfile(name: String) {
        viewModelScope.launch {
            val nextProfile = Profile(
                name = name,
                charName = name,
                charClass = "Следопыт",
                charRace = "Человек",
                charLevel = 1,
                hpCurrent = 10,
                hpMax = 10
            )
            val newId = repository.insertProfile(nextProfile)
            _activeProfileId.value = newId
        }
    }

    fun updateProfileCard(
        name: String,
        charClass: String,
        charRace: String,
        level: Int,
        alignment: String,
        campaign: String
    ) {
        val current = currentProfile.value ?: return
        updateProfileJob?.cancel()
        updateProfileJob = viewModelScope.launch {
            kotlinx.coroutines.delay(350)
            val updated = current.copy(
                charName = name,
                charClass = charClass,
                charRace = charRace,
                charLevel = level,
                charAlignment = alignment,
                campaignName = campaign,
                // Also update selector name if it matches
                name = if (current.name == current.charName) name else current.name
            )
            repository.updateProfile(updated)
        }
    }

    fun updateGold(wallet: Int, bank: Int, debt: Int, notes: String) {
        val current = currentProfile.value ?: return
        updateGoldJob?.cancel()
        updateGoldJob = viewModelScope.launch {
            kotlinx.coroutines.delay(350)
            val updated = current.copy(
                walletGold = wallet.coerceIn(0, 1000000),
                bankGold = bank.coerceIn(0, 1000000),
                debtGold = debt.coerceIn(0, 1000000),
                otherCurrencyNote = notes
            )
            repository.updateProfile(updated)
        }
    }

    fun updateStats(
        ac: Int,
        speed: Int,
        initiative: Int,
        hpCurrent: Int,
        hpMax: Int,
        strength: Int,
        dexterity: Int,
        constitution: Int,
        intelligence: Int,
        wisdom: Int,
        charisma: Int
    ) {
        val current = currentProfile.value ?: return
        updateStatsJob?.cancel()
        updateStatsJob = viewModelScope.launch {
            kotlinx.coroutines.delay(350)
            val safeHpMax = hpMax.coerceIn(1, 10000)
            val updated = current.copy(
                armorClass = ac.coerceIn(0, 100),
                speed = speed.coerceIn(0, 500),
                initiative = initiative.coerceIn(-50, 50),
                hpCurrent = hpCurrent.coerceIn(0, safeHpMax),
                hpMax = safeHpMax,
                strength = strength.coerceIn(0, 100),
                dexterity = dexterity.coerceIn(0, 100),
                constitution = constitution.coerceIn(0, 100),
                intelligence = intelligence.coerceIn(0, 100),
                wisdom = wisdom.coerceIn(0, 100),
                charisma = charisma.coerceIn(0, 100)
            )
            repository.updateProfile(updated)
        }
    }

    fun updateCampaignNotes(text: String) {
        val current = currentProfile.value ?: return
        updateNotesJob?.cancel()
        updateNotesJob = viewModelScope.launch {
            kotlinx.coroutines.delay(350)
            repository.updateProfile(current.copy(campaignNotes = text))
        }
    }

    fun updateSettings(dm: String, code: String, player: String) {
        val current = currentProfile.value ?: return
        updateSettingsJob?.cancel()
        updateSettingsJob = viewModelScope.launch {
            kotlinx.coroutines.delay(350)
            repository.updateProfile(current.copy(
                dmName = dm,
                campaignCode = code,
                playerNick = player
            ))
        }
    }

    fun deleteCurrentProfile() {
        val current = currentProfile.value ?: return
        viewModelScope.launch {
            repository.deleteProfile(current)
            // select another
            val other = allProfiles.value.firstOrNull { it.id != current.id }
            if (other != null) {
                _activeProfileId.value = other.id
            } else {
                // Seed new default so database is never empty
                seedDefaultData()
            }
        }
    }

    fun resetProfile() {
        val current = currentProfile.value ?: return
        viewModelScope.launch {
            // Delete associated content
            currentFeatures.value.forEach { repository.deleteFeature(it) }
            currentInventory.value.forEach { repository.deleteInventoryItem(it) }
            currentEquipped.value.forEach { repository.deleteEquippedItem(it) }
            currentNpcs.value.forEach { repository.deleteNpc(it) }
            currentQuests.value.forEach { repository.deleteQuest(it) }
            currentPotions.value.forEach { repository.deletePotion(it) }
            currentConsumables.value.forEach { repository.deleteConsumable(it) }
            repository.clearDiceLogsForProfile(current.id)

            // Reset profile stats
            val resetProfile = Profile(
                id = current.id,
                name = current.name,
                charName = current.name,
                charClass = "",
                charRace = "",
                charLevel = 1,
                hpCurrent = 10,
                hpMax = 10
            )
            repository.updateProfile(resetProfile)
        }
    }

    // --- FEATURES ACTIONS ---
    fun addFeature(title: String, description: String) {
        val pId = _activeProfileId.value ?: return
        viewModelScope.launch {
            val count = currentFeatures.value.size
            repository.insertFeature(FeatureFeat(
                profileId = pId,
                title = title,
                description = description,
                sortOrder = count
            ))
        }
    }

    fun deleteFeature(feat: FeatureFeat) {
        viewModelScope.launch { repository.deleteFeature(feat) }
    }

    fun editFeature(feat: FeatureFeat) {
        val key = "feat_${feat.id}"
        itemUpdateJobs[key]?.cancel()
        itemUpdateJobs[key] = viewModelScope.launch {
            kotlinx.coroutines.delay(350)
            repository.updateFeature(feat)
        }
    }

    fun moveFeature(feat: FeatureFeat, up: Boolean) {
        val list = currentFeatures.value.toMutableList()
        val index = list.indexOfFirst { it.id == feat.id }
        if (index == -1) return
        val targetIndex = if (up) index - 1 else index + 1
        if (targetIndex in list.indices) {
            val target = list[targetIndex]
            viewModelScope.launch {
                repository.updateFeature(feat.copy(sortOrder = target.sortOrder))
                repository.updateFeature(target.copy(sortOrder = feat.sortOrder))
            }
        }
    }

    // --- INVENTORY ACTIONS ---
    fun addInventoryItem(name: String, qty: Int, weight: Double, value: Int, notes: String) {
        val pId = _activeProfileId.value ?: return
        viewModelScope.launch {
            val count = currentInventory.value.size
            repository.insertInventoryItem(InventoryItem(
                profileId = pId,
                name = name,
                quantity = qty,
                weight = weight,
                value = value,
                notes = notes,
                sortOrder = count
            ))
        }
    }

    fun deleteInventoryItem(item: InventoryItem) {
        viewModelScope.launch { repository.deleteInventoryItem(item) }
    }

    fun editInventoryItem(item: InventoryItem) {
        val key = "inv_${item.id}"
        itemUpdateJobs[key]?.cancel()
        itemUpdateJobs[key] = viewModelScope.launch {
            kotlinx.coroutines.delay(350)
            repository.updateInventoryItem(item)
        }
    }

    fun moveInventoryItem(item: InventoryItem, up: Boolean) {
        val list = currentInventory.value.toMutableList()
        val index = list.indexOfFirst { it.id == item.id }
        if (index == -1) return
        val targetIndex = if (up) index - 1 else index + 1
        if (targetIndex in list.indices) {
            val target = list[targetIndex]
            viewModelScope.launch {
                repository.updateInventoryItem(item.copy(sortOrder = target.sortOrder))
                repository.updateInventoryItem(target.copy(sortOrder = item.sortOrder))
            }
        }
    }

    // --- EQUIPPED ACTIONS ---
    fun addEquippedItem(slot: String, name: String, notes: String) {
        val pId = _activeProfileId.value ?: return
        viewModelScope.launch {
            val count = currentEquipped.value.size
            repository.insertEquippedItem(EquippedItem(
                profileId = pId,
                slot = slot,
                name = name,
                notes = notes,
                sortOrder = count
            ))
        }
    }

    fun deleteEquippedItem(item: EquippedItem) {
        viewModelScope.launch { repository.deleteEquippedItem(item) }
    }

    fun editEquippedItem(item: EquippedItem) {
        val key = "eq_${item.id}"
        itemUpdateJobs[key]?.cancel()
        itemUpdateJobs[key] = viewModelScope.launch {
            kotlinx.coroutines.delay(350)
            repository.updateEquippedItem(item)
        }
    }

    fun moveEquippedItem(item: EquippedItem, up: Boolean) {
        val list = currentEquipped.value.toMutableList()
        val index = list.indexOfFirst { it.id == item.id }
        if (index == -1) return
        val targetIndex = if (up) index - 1 else index + 1
        if (targetIndex in list.indices) {
            val target = list[targetIndex]
            viewModelScope.launch {
                repository.updateEquippedItem(item.copy(sortOrder = target.sortOrder))
                repository.updateEquippedItem(target.copy(sortOrder = item.sortOrder))
            }
        }
    }

    // --- NPC ACTIONS ---
    fun addNpc(name: String, role: String, faction: String, location: String, relation: String, tags: String, notes: String) {
        val pId = _activeProfileId.value ?: return
        viewModelScope.launch {
            repository.insertNpc(NpcCharacter(
                profileId = pId,
                name = name,
                role = role,
                faction = faction,
                location = location,
                relationship = relation,
                tags = tags,
                notes = notes
            ))
        }
    }

    fun deleteNpc(npc: NpcCharacter) {
        viewModelScope.launch { repository.deleteNpc(npc) }
    }

    fun editNpc(npc: NpcCharacter) {
        val key = "npc_${npc.id}"
        itemUpdateJobs[key]?.cancel()
        itemUpdateJobs[key] = viewModelScope.launch {
            kotlinx.coroutines.delay(350)
            repository.updateNpc(npc)
        }
    }

    // --- QUESTS ACTIONS ---
    fun addQuest(name: String, type: String, description: String) {
        val pId = _activeProfileId.value ?: return
        viewModelScope.launch {
            repository.insertQuest(Quest(
                profileId = pId,
                name = name,
                type = type,
                description = description,
                status = "Активный"
            ))
        }
    }

    fun updateQuestStatus(quest: Quest, status: String) {
        viewModelScope.launch {
            repository.updateQuest(quest.copy(status = status))
        }
    }

    fun deleteQuest(quest: Quest) {
        viewModelScope.launch { repository.deleteQuest(quest) }
    }

    fun editQuest(quest: Quest) {
        val key = "quest_${quest.id}"
        itemUpdateJobs[key]?.cancel()
        itemUpdateJobs[key] = viewModelScope.launch {
            kotlinx.coroutines.delay(350)
            repository.updateQuest(quest)
        }
    }

    // --- POTIONS ACTIONS ---
    fun addPotion(name: String, quantity: Int, description: String) {
        val pId = _activeProfileId.value ?: return
        viewModelScope.launch {
            val count = currentPotions.value.size
            repository.insertPotion(Potion(
                profileId = pId,
                name = name,
                quantity = quantity,
                description = description,
                sortOrder = count
            ))
        }
    }

    fun updatePotionQty(potion: Potion, newQty: Int) {
        viewModelScope.launch {
            if (newQty <= 0) {
                repository.deletePotion(potion)
            } else {
                repository.updatePotion(potion.copy(quantity = newQty))
            }
        }
    }

    fun deletePotion(potion: Potion) {
        viewModelScope.launch { repository.deletePotion(potion) }
    }

    fun editPotion(potion: Potion) {
        val key = "pot_${potion.id}"
        itemUpdateJobs[key]?.cancel()
        itemUpdateJobs[key] = viewModelScope.launch {
            kotlinx.coroutines.delay(350)
            repository.updatePotion(potion)
        }
    }

    fun movePotion(potion: Potion, up: Boolean) {
        val list = currentPotions.value.toMutableList()
        val index = list.indexOfFirst { it.id == potion.id }
        if (index == -1) return
        val targetIndex = if (up) index - 1 else index + 1
        if (targetIndex in list.indices) {
            val target = list[targetIndex]
            viewModelScope.launch {
                repository.updatePotion(potion.copy(sortOrder = target.sortOrder))
                repository.updatePotion(target.copy(sortOrder = potion.sortOrder))
            }
        }
    }

    // --- CONSUMABLES ACTIONS ---
    fun addConsumable(name: String, quantity: Int, description: String) {
        val pId = _activeProfileId.value ?: return
        viewModelScope.launch {
            val count = currentConsumables.value.size
            repository.insertConsumable(Consumable(
                profileId = pId,
                name = name,
                quantity = quantity,
                description = description,
                sortOrder = count
            ))
        }
    }

    fun updateConsumableQty(item: Consumable, newQty: Int) {
        viewModelScope.launch {
            if (newQty <= 0) {
                repository.deleteConsumable(item)
            } else {
                repository.updateConsumable(item.copy(quantity = newQty))
            }
        }
    }

    fun deleteConsumable(item: Consumable) {
        viewModelScope.launch { repository.deleteConsumable(item) }
    }

    fun editConsumable(item: Consumable) {
        val key = "con_${item.id}"
        itemUpdateJobs[key]?.cancel()
        itemUpdateJobs[key] = viewModelScope.launch {
            kotlinx.coroutines.delay(350)
            repository.updateConsumable(item)
        }
    }

    fun moveConsumable(item: Consumable, up: Boolean) {
        val list = currentConsumables.value.toMutableList()
        val index = list.indexOfFirst { it.id == item.id }
        if (index == -1) return
        val targetIndex = if (up) index - 1 else index + 1
        if (targetIndex in list.indices) {
            val target = list[targetIndex]
            viewModelScope.launch {
                repository.updateConsumable(item.copy(sortOrder = target.sortOrder))
                repository.updateConsumable(target.copy(sortOrder = item.sortOrder))
            }
        }
    }

    // --- DICE ACTIONS ---
    fun rollDice(notation: String, itemIndex: Int = 1) {
        val pId = _activeProfileId.value ?: return
        viewModelScope.launch {
            val eval = evaluateDiceNotation(notation)
            val finalVal = eval.sum
            lastRolledValue.value = finalVal
            lastRolledNotation.value = notation

            lastRollFirstVal.value = finalVal
            lastRollSecondVal.value = null
            lastRollType.value = ""
            lastRollChoice.value = 0
            lastRollFirstDetail.value = eval.rollsText
            lastRollSecondDetail.value = ""
            lastRollFirstNotation.value = notation
            lastRollSecondNotation.value = ""

            val detail = if (eval.rollsText.isNotEmpty()) "[${eval.rollsText}]" else ""
            val logItem = DiceRollLog(
                profileId = pId,
                notation = notation,
                resultsText = "$detail $finalVal",
                finalResult = finalVal
            )
            repository.insertDiceLog(logItem)
        }
    }

    private class RollModeEvaluation(
        val finalValue: Int,
        val detailText: String,
        val logText: String,
        val rawVal1: Int = 0,
        val rawVal2: Int = 0,
        val choice: Int = 0, // 1 or 2
        val rawDetail1: String = "",
        val rawDetail2: String = ""
    )

    private fun performSingleOrModeRoll(notation: String, mode: String): RollModeEvaluation {
        if (mode == "Обычный") {
            val eval = evaluateDiceNotation(notation)
            val detail = if (eval.rollsText.isNotEmpty()) "[${eval.rollsText}]" else ""
            return RollModeEvaluation(
                finalValue = eval.sum,
                detailText = eval.rollsText,
                logText = "$detail ${eval.sum}"
            )
        } else {
            val eval1 = evaluateDiceNotation(notation)
            val eval2 = evaluateDiceNotation(notation)
            val r1 = eval1.sum
            val r2 = eval2.sum
            val isAdv = mode == "Преим."
            val finalVal = if (isAdv) maxOf(r1, r2) else minOf(r1, r2)
            val choice = if (isAdv) {
                if (r1 >= r2) 1 else 2
            } else {
                if (r1 <= r2) 1 else 2
            }
            val label = if (isAdv) "Преим." else "Помеха"
            val logText = "$label: ($r1 vs $r2) -> $finalVal"
            return RollModeEvaluation(
                finalValue = finalVal,
                detailText = "$r1 vs $r2",
                logText = logText,
                rawVal1 = r1,
                rawVal2 = r2,
                choice = choice,
                rawDetail1 = eval1.rollsText,
                rawDetail2 = eval2.rollsText
            )
        }
    }

    fun triggerRoll() {
        val notation1 = diceNotation1.value
        val notation2 = diceNotation2.value
        val mode = activeRollMode.value
        val target = activeRollTarget.value // 1 = 1-й, 2 = 2-й, 3 = Оба
        val pId = _activeProfileId.value ?: return

        viewModelScope.launch {
            if (target == 3) {
                // Both dice rolls
                val eval1 = performSingleOrModeRoll(notation1, mode)
                val eval2 = performSingleOrModeRoll(notation2, mode)

                val sumResult = eval1.finalValue + eval2.finalValue
                lastRolledValue.value = sumResult
                lastRolledNotation.value = if (mode == "Обычный") {
                    "$notation1 + $notation2"
                } else {
                    "$notation1 ($mode) + $notation2 ($mode)"
                }

                lastRollFirstVal.value = eval1.finalValue
                lastRollSecondVal.value = eval2.finalValue
                lastRollType.value = "both"
                lastRollChoice.value = 0
                lastRollFirstDetail.value = eval1.detailText
                lastRollSecondDetail.value = eval2.detailText
                lastRollFirstNotation.value = notation1 + (if (mode != "Обычный") " ($mode)" else "")
                lastRollSecondNotation.value = notation2 + (if (mode != "Обычный") " ($mode)" else "")

                val combinedResultsText = "1st: ${eval1.logText} | 2nd: ${eval2.logText}"
                repository.insertDiceLog(DiceRollLog(
                    profileId = pId,
                    notation = lastRolledNotation.value,
                    resultsText = combinedResultsText,
                    finalResult = sumResult
                ))
            } else {
                // Single dice roll
                val isFirst = target == 1
                val notation = if (isFirst) notation1 else notation2
                val eval = performSingleOrModeRoll(notation, mode)

                lastRolledValue.value = eval.finalValue
                lastRolledNotation.value = if (mode == "Обычный") notation else "$notation ($mode)"

                if (mode == "Обычный") {
                    lastRollFirstVal.value = eval.finalValue
                    lastRollSecondVal.value = null
                    lastRollType.value = ""
                    lastRollChoice.value = 0
                    lastRollFirstDetail.value = eval.detailText
                    lastRollSecondDetail.value = ""
                } else {
                    lastRollFirstVal.value = eval.rawVal1
                    lastRollSecondVal.value = eval.rawVal2
                    lastRollType.value = if (mode == "Преим.") "adv" else "dis"
                    lastRollChoice.value = eval.choice
                    lastRollFirstDetail.value = eval.rawDetail1
                    lastRollSecondDetail.value = eval.rawDetail2
                }
                lastRollFirstNotation.value = lastRolledNotation.value
                lastRollSecondNotation.value = ""

                repository.insertDiceLog(DiceRollLog(
                    profileId = pId,
                    notation = lastRolledNotation.value,
                    resultsText = eval.logText,
                    finalResult = eval.finalValue
                ))
            }
        }
    }

    fun rollActiveMode(notation1: String, notation2: String, isFirst: Boolean) {
        activeRollTarget.value = if (isFirst) 1 else 2
        triggerRoll()
    }

    fun rollBoth(notation1: String, notation2: String) {
        activeRollTarget.value = 3
        triggerRoll()
    }

    fun clearDiceLogs() {
        val pId = _activeProfileId.value ?: return
        viewModelScope.launch { repository.clearDiceLogsForProfile(pId) }
    }

    data class EvaluationResult(val sum: Int, val rollsText: String)

    private fun evaluateDiceNotation(notation: String): EvaluationResult {
        // Simple regex to parse dice like 1d20, d20, d8, 1d8+3, 2d6-1
        val clean = notation.replace(" ", "").lowercase()
        val regex = Regex("^(\\d*)d(\\d+)([+-]\\d+)?$")
        val match = regex.matchEntire(clean)

        if (match == null) {
            // Treat as static number or run standard d20
            val staticVal = clean.toIntOrNull()
            return if (staticVal != null) {
                EvaluationResult(staticVal, "$staticVal")
            } else {
                val roll = Random.nextInt(1, 21)
                EvaluationResult(roll, "$roll")
            }
        }

        val countStr = match.groupValues[1]
        val sidesStr = match.groupValues[2]
        val modStr = match.groupValues[3]

        val count = if (countStr.isEmpty()) 1 else (countStr.toIntOrNull() ?: 1).coerceAtMost(100)
        val sides = (sidesStr.toIntOrNull() ?: 20).coerceAtMost(10000)
        val mod = if (modStr.isNullOrEmpty()) 0 else (modStr.toIntOrNull() ?: 0)

        val rolls = mutableListOf<Int>()
        var sum = 0
        for (i in 0 until count) {
            if (sides > 0) {
                val r = Random.nextInt(1, sides + 1)
                rolls.add(r)
                sum += r
            }
        }

        sum += mod
        
        val rollsJoined = rolls.joinToString("+")
        val rollsAndMod = if (mod != 0) {
            val modSign = if (mod > 0) "+$mod" else "$mod"
            "$rollsJoined$modSign"
        } else {
            rollsJoined
        }

        return EvaluationResult(sum, rollsAndMod)
    }

    // --- JSON PORTABILITY (EXPORT / IMPORT) ---
    fun exportProfileToJson(): String {
        val current = currentProfile.value ?: return "{}"
        return try {
            val json = JSONObject()
            // Profile core
            val pJson = JSONObject()
            pJson.put("charName", current.charName)
            pJson.put("charClass", current.charClass)
            pJson.put("charRace", current.charRace)
            pJson.put("charLevel", current.charLevel)
            pJson.put("charAlignment", current.charAlignment)
            pJson.put("campaignName", current.campaignName)
            pJson.put("walletGold", current.walletGold)
            pJson.put("bankGold", current.bankGold)
            pJson.put("debtGold", current.debtGold)
            pJson.put("otherCurrencyNote", current.otherCurrencyNote)
            pJson.put("armorClass", current.armorClass)
            pJson.put("speed", current.speed)
            pJson.put("initiative", current.initiative)
            pJson.put("hpCurrent", current.hpCurrent)
            pJson.put("hpMax", current.hpMax)
            pJson.put("strength", current.strength)
            pJson.put("dexterity", current.dexterity)
            pJson.put("constitution", current.constitution)
            pJson.put("intelligence", current.intelligence)
            pJson.put("wisdom", current.wisdom)
            pJson.put("charisma", current.charisma)
            pJson.put("campaignNotes", current.campaignNotes)
            pJson.put("dmName", current.dmName)
            pJson.put("campaignCode", current.campaignCode)
            pJson.put("playerNick", current.playerNick)
            json.put("profile", pJson)

            // Features
            val featsArr = JSONArray()
            currentFeatures.value.forEach {
                val item = JSONObject()
                item.put("title", it.title)
                item.put("description", it.description)
                item.put("sortOrder", it.sortOrder)
                featsArr.put(item)
            }
            json.put("features", featsArr)

            // Inventory
            val invArr = JSONArray()
            currentInventory.value.forEach {
                val item = JSONObject()
                item.put("name", it.name)
                item.put("quantity", it.quantity)
                item.put("weight", it.weight)
                item.put("value", it.value)
                item.put("notes", it.notes)
                item.put("sortOrder", it.sortOrder)
                invArr.put(item)
            }
            json.put("inventory", invArr)

            // Equipped
            val eqArr = JSONArray()
            currentEquipped.value.forEach {
                val item = JSONObject()
                item.put("slot", it.slot)
                item.put("name", it.name)
                item.put("notes", it.notes)
                item.put("sortOrder", it.sortOrder)
                eqArr.put(item)
            }
            json.put("equipped", eqArr)

            // NPCs
            val npcArr = JSONArray()
            currentNpcs.value.forEach {
                val item = JSONObject()
                item.put("name", it.name)
                item.put("role", it.role)
                item.put("faction", it.faction)
                item.put("location", it.location)
                item.put("relationship", it.relationship)
                item.put("tags", it.tags)
                item.put("notes", it.notes)
                npcArr.put(item)
            }
            json.put("npcs", npcArr)

            // Quests
            val crArr = JSONArray()
            currentQuests.value.forEach {
                val item = JSONObject()
                item.put("name", it.name)
                item.put("type", it.type)
                item.put("description", it.description)
                item.put("status", it.status)
                crArr.put(item)
            }
            json.put("quests", crArr)

            // Potions
            val potArr = JSONArray()
            currentPotions.value.forEach {
                val item = JSONObject()
                item.put("name", it.name)
                item.put("quantity", it.quantity)
                item.put("description", it.description)
                item.put("sortOrder", it.sortOrder)
                potArr.put(item)
            }
            json.put("potions", potArr)

            // Consumables
            val consArr = JSONArray()
            currentConsumables.value.forEach {
                val item = JSONObject()
                item.put("name", it.name)
                item.put("quantity", it.quantity)
                item.put("description", it.description)
                item.put("sortOrder", it.sortOrder)
                consArr.put(item)
            }
            json.put("consumables", consArr)

            json.toString(2)
        } catch (e: Exception) {
            "Ошибка экспорта: ${e.localizedMessage}"
        }
    }

    fun importProfileFromJson(jsonStr: String): Boolean {
        return try {
            val root = JSONObject(jsonStr)
            val pJson = root.getJSONObject("profile")

            val importName = pJson.optString("charName", "Импорт") + " (Имп.)"

            val imported = Profile(
                name = importName,
                charName = pJson.optString("charName", "Импорт"),
                charClass = pJson.optString("charClass", ""),
                charRace = pJson.optString("charRace", ""),
                charLevel = pJson.optInt("charLevel", 1),
                charAlignment = pJson.optString("charAlignment", ""),
                campaignName = pJson.optString("campaignName", ""),
                walletGold = pJson.optInt("walletGold", 0),
                bankGold = pJson.optInt("bankGold", 0),
                debtGold = pJson.optInt("debtGold", 0),
                otherCurrencyNote = pJson.optString("otherCurrencyNote", ""),
                armorClass = pJson.optInt("armorClass", 10),
                speed = pJson.optInt("speed", 30),
                initiative = pJson.optInt("initiative", 0),
                hpCurrent = pJson.optInt("hpCurrent", 10),
                hpMax = pJson.optInt("hpMax", 10),
                strength = pJson.optInt("strength", 10),
                dexterity = pJson.optInt("dexterity", 10),
                constitution = pJson.optInt("constitution", 10),
                intelligence = pJson.optInt("intelligence", 10),
                wisdom = pJson.optInt("wisdom", 10),
                charisma = pJson.optInt("charisma", 10),
                campaignNotes = pJson.optString("campaignNotes", ""),
                dmName = pJson.optString("dmName", ""),
                campaignCode = pJson.optString("campaignCode", ""),
                playerNick = pJson.optString("playerNick", "")
            )

            viewModelScope.launch {
                val newId = repository.insertProfile(imported)

                // Features
                root.optJSONArray("features")?.let { arr ->
                    for (i in 0 until arr.length()) {
                        val o = arr.getJSONObject(i)
                        repository.insertFeature(FeatureFeat(
                            profileId = newId,
                            title = o.optString("title", ""),
                            description = o.optString("description", ""),
                            sortOrder = o.optInt("sortOrder", i),
                            isExpanded = true
                        ))
                    }
                }

                // Inventory
                root.optJSONArray("inventory")?.let { arr ->
                    for (i in 0 until arr.length()) {
                        val o = arr.getJSONObject(i)
                        repository.insertInventoryItem(InventoryItem(
                            profileId = newId,
                            name = o.optString("name", ""),
                            quantity = o.optInt("quantity", 1),
                            weight = o.optDouble("weight", 0.0),
                            value = o.optInt("value", 0),
                            notes = o.optString("notes", ""),
                            sortOrder = o.optInt("sortOrder", i)
                        ))
                    }
                }

                // Equipped
                root.optJSONArray("equipped")?.let { arr ->
                    for (i in 0 until arr.length()) {
                        val o = arr.getJSONObject(i)
                        repository.insertEquippedItem(EquippedItem(
                            profileId = newId,
                            slot = o.optString("slot", ""),
                            name = o.optString("name", ""),
                            notes = o.optString("notes", ""),
                            sortOrder = o.optInt("sortOrder", i)
                        ))
                    }
                }

                // NPCs
                root.optJSONArray("npcs")?.let { arr ->
                    for (i in 0 until arr.length()) {
                        val o = arr.getJSONObject(i)
                        repository.insertNpc(NpcCharacter(
                            profileId = newId,
                            name = o.optString("name", ""),
                            role = o.optString("role", ""),
                            faction = o.optString("faction", ""),
                            location = o.optString("location", ""),
                            relationship = o.optString("relationship", "Дружел."),
                            tags = o.optString("tags", ""),
                            notes = o.optString("notes", "")
                        ))
                    }
                }

                // Quests
                root.optJSONArray("quests")?.let { arr ->
                    for (i in 0 until arr.length()) {
                        val o = arr.getJSONObject(i)
                        repository.insertQuest(Quest(
                            profileId = newId,
                            name = o.optString("name", ""),
                            type = o.optString("type", ""),
                            description = o.optString("description", ""),
                            status = o.optString("status", "Активный")
                        ))
                    }
                }

                // Potions
                root.optJSONArray("potions")?.let { arr ->
                    for (i in 0 until arr.length()) {
                        val o = arr.getJSONObject(i)
                        repository.insertPotion(Potion(
                            profileId = newId,
                            name = o.optString("name", ""),
                            quantity = o.optInt("quantity", 1),
                            description = o.optString("description", ""),
                            sortOrder = o.optInt("sortOrder", i)
                        ))
                    }
                }

                // Consumables
                root.optJSONArray("consumables")?.let { arr ->
                    for (i in 0 until arr.length()) {
                        val o = arr.getJSONObject(i)
                        repository.insertConsumable(Consumable(
                            profileId = newId,
                            name = o.optString("name", ""),
                            quantity = o.optInt("quantity", 1),
                            description = o.optString("description", ""),
                            sortOrder = o.optInt("sortOrder", i)
                        ))
                    }
                }

                _activeProfileId.value = newId
            }
            true
        } catch (e: Exception) {
            false
        }
    }
}
