package com.example.ui

import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.Canvas
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.data.*
import java.util.Locale

// Primary design color tokens matching screenshots (Clean Minimalism Theme)
val ColorBgDark = Color(0xFF1C1B1F)       // Dark charcoal background
val ColorSurfaceDark = Color(0xFF2B2930)  // Rich medium slate card background
val ColorPurpleAccent = Color(0xFFD0BCFF) // Light lavender primary accent
val ColorGoldAccent = Color(0xFFEADDFF)   // Soft lilac secondary accent
val ColorBorderDark = Color(0xFF49454F)   // Clean M3 outline border
val ColorTextMuted = Color(0xFF938F99)    // Elegant grey subtitle

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DndMainScreen(viewModel: DndViewModel) {
    val lang by viewModel.appLanguage.collectAsStateWithLifecycle()

    CompositionLocalProvider(LocalLanguage provides lang) {
        val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current
    
    val profiles by viewModel.allProfiles.collectAsStateWithLifecycle()
    val activeId by viewModel.activeProfileId.collectAsStateWithLifecycle()
    val activeProfile by viewModel.currentProfile.collectAsStateWithLifecycle()

    // Top-level Composable flow collections
    val features by viewModel.currentFeatures.collectAsStateWithLifecycle()
    val inventory by viewModel.currentInventory.collectAsStateWithLifecycle()
    val equipped by viewModel.currentEquipped.collectAsStateWithLifecycle()
    val npcs by viewModel.currentNpcs.collectAsStateWithLifecycle()
    val quests by viewModel.currentQuests.collectAsStateWithLifecycle()
    val potions by viewModel.currentPotions.collectAsStateWithLifecycle()
    val consumables by viewModel.currentConsumables.collectAsStateWithLifecycle()
    val logs by viewModel.currentDiceLogs.collectAsStateWithLifecycle()
    val code1 by viewModel.diceNotation1.collectAsStateWithLifecycle()
    val code2 by viewModel.diceNotation2.collectAsStateWithLifecycle()
    val mode by viewModel.activeRollMode.collectAsStateWithLifecycle()
    val rolledVal by viewModel.lastRolledValue.collectAsStateWithLifecycle()
    val rolledNot by viewModel.lastRolledNotation.collectAsStateWithLifecycle()
    val collapsedItemIds by viewModel.collapsedItemIds.collectAsStateWithLifecycle()

    val activeTarget by viewModel.activeRollTarget.collectAsStateWithLifecycle()
    val rollFirstVal by viewModel.lastRollFirstVal.collectAsStateWithLifecycle()
    val rollSecondVal by viewModel.lastRollSecondVal.collectAsStateWithLifecycle()
    val rollType by viewModel.lastRollType.collectAsStateWithLifecycle()
    val rollChoice by viewModel.lastRollChoice.collectAsStateWithLifecycle()
    val rollFirstDetail by viewModel.lastRollFirstDetail.collectAsStateWithLifecycle()
    val rollSecondDetail by viewModel.lastRollSecondDetail.collectAsStateWithLifecycle()
    val rollFirstNotation by viewModel.lastRollFirstNotation.collectAsStateWithLifecycle()
    val rollSecondNotation by viewModel.lastRollSecondNotation.collectAsStateWithLifecycle()

    // Top Card Collapse
    var trackerExpanded by remember { mutableStateOf(true) }
    // Gold Card Collapse
    var goldExpanded by remember { mutableStateOf(true) }

    // Active Tab Selection
    val tabs = listOf("Черты", "Инвентарь", "Эквип", "Персонажи", "Квесты", "Зелья", "Расходники", "Кубы", "Заметки", "Статы", "⚙️")
    var selectedTab by remember { mutableStateOf("Черты") }

    // Dropdown Profile state
    var showProfileDropdown by remember { mutableStateOf(false) }
    var showAddProfileDialog by remember { mutableStateOf(false) }
    var newProfileName by remember { mutableStateOf("") }

    // Import/Export dialog states
    var showExportDialog by remember { mutableStateOf(false) }
    var showImportDialog by remember { mutableStateOf(false) }
    var importJsonText by remember { mutableStateOf("") }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = ColorBgDark
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            
            // --- PROFILE HEADER CAROUSEL & SELECTOR ---
            item {
                Spacer(modifier = Modifier.height(8.dp))
                activeProfile?.let { prof ->
                    var levelText by remember(prof.id) { mutableStateOf(prof.charLevel.toString()) }
                    var nameText by remember(prof.id) { mutableStateOf(prof.charName) }
                    var classText by remember(prof.id) { mutableStateOf(prof.charClass) }
                    var raceText by remember(prof.id) { mutableStateOf(prof.charRace) }
                    var alignmentText by remember(prof.id) { mutableStateOf(prof.charAlignment) }
                    var campaignText by remember(prof.id) { mutableStateOf(prof.campaignName) }

                    LaunchedEffect(prof.charLevel) {
                        if (levelText != prof.charLevel.toString()) {
                            levelText = prof.charLevel.toString()
                        }
                    }
                    LaunchedEffect(prof.charName) {
                        if (nameText != prof.charName) {
                            nameText = prof.charName
                        }
                    }
                    LaunchedEffect(prof.charClass) {
                        if (classText != prof.charClass) {
                            classText = prof.charClass
                        }
                    }
                    LaunchedEffect(prof.charRace) {
                        if (raceText != prof.charRace) {
                            raceText = prof.charRace
                        }
                    }
                    LaunchedEffect(prof.charAlignment) {
                        if (alignmentText != prof.charAlignment) {
                            alignmentText = prof.charAlignment
                        }
                    }
                    LaunchedEffect(prof.campaignName) {
                        if (campaignText != prof.campaignName) {
                            campaignText = prof.campaignName
                        }
                    }
                    Card(
                        colors = CardDefaults.cardColors(containerColor = ColorSurfaceDark),
                        shape = RoundedCornerShape(28.dp),
                        border = BorderStroke(1.dp, ColorBorderDark.copy(alpha = 0.3f)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.clickable { trackerExpanded = !trackerExpanded }
                                ) {
                                    Icon(
                                        imageVector = if (trackerExpanded) Icons.Default.ArrowDropUp else Icons.Default.ArrowDropDown,
                                        contentDescription = "Toggle",
                                        tint = Color.White
                                      )
                                    Text(
                                        text = "DnD Tracker",
                                        color = Color.White,
                                        fontSize = 20.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                                val classDisplay = if (classText.isEmpty()) "Следопыт".loc() else classText.loc()
                                val levelDisplay = "ур.".loc()
                                Text(
                                    text = "$nameText · $classDisplay $levelDisplay.$levelText",
                                    color = ColorTextMuted,
                                    fontSize = 12.sp
                                )
                            }

                            AnimatedVisibility(visible = trackerExpanded) {
                                Column(modifier = Modifier.padding(top = 8.dp)) {
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        OutlinedTextField(
                                            value = nameText,
                                            onValueChange = {
                                                nameText = it
                                                viewModel.updateProfileCard(it, classText, raceText, prof.charLevel, alignmentText, campaignText)
                                            },
                                            label = { Text("Имя персонажа".loc(), color = ColorTextMuted, fontSize = 11.sp) },
                                            colors = getTextFieldColors(),
                                            modifier = Modifier.weight(1f),
                                            shape = RoundedCornerShape(8.dp),
                                            singleLine = true
                                        )
                                        OutlinedTextField(
                                            value = classText,
                                            onValueChange = {
                                                classText = it
                                                viewModel.updateProfileCard(nameText, it, raceText, prof.charLevel, alignmentText, campaignText)
                                            },
                                            label = { Text("Класс".loc(), color = ColorTextMuted, fontSize = 11.sp) },
                                            colors = getTextFieldColors(),
                                            modifier = Modifier.weight(1f),
                                            shape = RoundedCornerShape(8.dp),
                                            singleLine = true
                                        )
                                    }
                                    Spacer(modifier = Modifier.height(6.dp))
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        OutlinedTextField(
                                            value = raceText,
                                            onValueChange = {
                                                raceText = it
                                                viewModel.updateProfileCard(nameText, classText, it, prof.charLevel, alignmentText, campaignText)
                                            },
                                            label = { Text("Раса".loc(), color = ColorTextMuted, fontSize = 11.sp) },
                                            colors = getTextFieldColors(),
                                            modifier = Modifier.weight(1.5f),
                                            shape = RoundedCornerShape(8.dp),
                                            singleLine = true
                                        )
                                        OutlinedTextField(
                                            value = levelText,
                                            onValueChange = { newValue ->
                                                val cleaned = newValue.filter { it.isDigit() }
                                                levelText = cleaned
                                                val parsed = cleaned.toIntOrNull()
                                                if (parsed != null) {
                                                    viewModel.updateProfileCard(nameText, classText, raceText, parsed, alignmentText, campaignText)
                                                }
                                            },
                                            label = { Text("Уровень".loc(), color = ColorTextMuted, fontSize = 11.sp) },
                                            colors = getTextFieldColors(),
                                            modifier = Modifier.weight(1f),
                                            shape = RoundedCornerShape(8.dp),
                                            singleLine = true,
                                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                                        )
                                        OutlinedTextField(
                                            value = alignmentText,
                                            onValueChange = {
                                                alignmentText = it
                                                viewModel.updateProfileCard(nameText, classText, raceText, prof.charLevel, it, campaignText)
                                            },
                                            label = { Text("Мировоззрение".loc(), color = ColorTextMuted, fontSize = 11.sp) },
                                            colors = getTextFieldColors(),
                                            modifier = Modifier.weight(1.5f),
                                            shape = RoundedCornerShape(8.dp),
                                            singleLine = true
                                        )
                                    }
                                    Spacer(modifier = Modifier.height(6.dp))
                                    OutlinedTextField(
                                        value = campaignText,
                                        onValueChange = {
                                            campaignText = it
                                            viewModel.updateProfileCard(nameText, classText, raceText, prof.charLevel, alignmentText, it)
                                        },
                                        label = { Text("Кампания".loc(), color = ColorTextMuted, fontSize = 11.sp) },
                                        colors = getTextFieldColors(),
                                        modifier = Modifier.fillMaxWidth(),
                                        shape = RoundedCornerShape(8.dp),
                                        singleLine = true
                                    )
                                    Spacer(modifier = Modifier.height(12.dp))
                                    HorizontalDivider(color = ColorBorderDark)
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Text("Профиль".loc(), color = ColorTextMuted, fontSize = 12.sp)
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Box(modifier = Modifier.weight(1f)) {
                                            Row(
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .background(ColorBgDark, RoundedCornerShape(8.dp))
                                                    .clickable { showProfileDropdown = true }
                                                    .padding(horizontal = 12.dp, vertical = 10.dp),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Text(prof.name, color = Color.White, fontSize = 14.sp)
                                                Icon(Icons.Default.ArrowDropDown, contentDescription = "", tint = ColorTextMuted)
                                            }
                                            DropdownMenu(
                                                expanded = showProfileDropdown,
                                                onDismissRequest = { showProfileDropdown = false },
                                                modifier = Modifier.background(ColorSurfaceDark)
                                            ) {
                                                profiles.forEach { item ->
                                                    DropdownMenuItem(
                                                        text = { Text(item.name, color = Color.White) },
                                                        onClick = {
                                                            viewModel.selectProfile(item.id)
                                                            showProfileDropdown = false
                                                        }
                                                    )
                                                }
                                            }
                                        }
                                        
                                        IconButton(
                                            onClick = { showAddProfileDialog = true },
                                            modifier = Modifier.background(ColorBgDark, RoundedCornerShape(8.dp))
                                        ) {
                                            Icon(Icons.Default.Add, contentDescription = "Add", tint = Color.White)
                                        }

                                        IconButton(
                                            onClick = { viewModel.deleteCurrentProfile() },
                                            modifier = Modifier.background(ColorBgDark, RoundedCornerShape(8.dp))
                                        ) {
                                            Icon(Icons.Default.Delete, contentDescription = "Delete", tint = Color.Red.copy(alpha = 0.8f))
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // --- DEBT & GOLD CARD ---
            item {
                activeProfile?.let { prof ->
                    var walletText by remember(prof.id) { mutableStateOf(if (prof.walletGold == 0) "" else prof.walletGold.toString()) }
                    var bankText by remember(prof.id) { mutableStateOf(if (prof.bankGold == 0) "" else prof.bankGold.toString()) }
                    var debtText by remember(prof.id) { mutableStateOf(if (prof.debtGold == 0) "" else prof.debtGold.toString()) }
                    var currencyText by remember(prof.id) { mutableStateOf(prof.otherCurrencyNote) }

                    LaunchedEffect(prof.walletGold) {
                        val expected = if (prof.walletGold == 0) "" else prof.walletGold.toString()
                        if (walletText != expected) {
                            walletText = expected
                        }
                    }
                    LaunchedEffect(prof.bankGold) {
                        val expected = if (prof.bankGold == 0) "" else prof.bankGold.toString()
                        if (bankText != expected) {
                            bankText = expected
                        }
                    }
                    LaunchedEffect(prof.debtGold) {
                        val expected = if (prof.debtGold == 0) "" else prof.debtGold.toString()
                        if (debtText != expected) {
                            debtText = expected
                        }
                    }
                    LaunchedEffect(prof.otherCurrencyNote) {
                        if (currencyText != prof.otherCurrencyNote) {
                            currencyText = prof.otherCurrencyNote
                        }
                    }
                    Card(
                        colors = CardDefaults.cardColors(containerColor = ColorSurfaceDark),
                        shape = RoundedCornerShape(28.dp),
                        border = BorderStroke(1.dp, ColorBorderDark.copy(alpha = 0.3f)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.clickable { goldExpanded = !goldExpanded }
                                ) {
                                    Icon(
                                        imageVector = if (goldExpanded) Icons.Default.ArrowDropUp else Icons.Default.ArrowDropDown,
                                        contentDescription = "Toggle",
                                        tint = ColorGoldAccent
                                    )
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text(
                                        text = "💰 Золото".loc(),
                                        color = ColorGoldAccent,
                                        fontSize = 18.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                                val sum = prof.walletGold + prof.bankGold - prof.debtGold
                                Text(
                                    text = "$sum " + "зм".loc(),
                                    color = Color.White,
                                    fontSize = 20.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }

                            AnimatedVisibility(visible = goldExpanded) {
                                Column(modifier = Modifier.padding(top = 8.dp)) {
                                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                        OutlinedTextField(
                                            value = walletText,
                                            onValueChange = { newValue ->
                                                val cleaned = newValue.filter { it.isDigit() }
                                                walletText = cleaned
                                                val parsed = cleaned.toIntOrNull() ?: 0
                                                viewModel.updateGold(parsed, prof.bankGold, prof.debtGold, currencyText)
                                            },
                                            label = { Text("В кармане".loc(), color = ColorTextMuted, fontSize = 10.sp) },
                                            colors = getTextFieldColors(),
                                            modifier = Modifier.weight(1f),
                                            shape = RoundedCornerShape(8.dp),
                                            singleLine = true,
                                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                                        )
                                        OutlinedTextField(
                                            value = bankText,
                                            onValueChange = { newValue ->
                                                val cleaned = newValue.filter { it.isDigit() }
                                                bankText = cleaned
                                                val parsed = cleaned.toIntOrNull() ?: 0
                                                viewModel.updateGold(prof.walletGold, parsed, prof.debtGold, currencyText)
                                            },
                                            label = { Text("В банке".loc(), color = ColorTextMuted, fontSize = 10.sp) },
                                            colors = getTextFieldColors(),
                                            modifier = Modifier.weight(1f),
                                            shape = RoundedCornerShape(8.dp),
                                            singleLine = true,
                                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                                        )
                                        OutlinedTextField(
                                            value = debtText,
                                            onValueChange = { newValue ->
                                                val cleaned = newValue.filter { it.isDigit() }
                                                debtText = cleaned
                                                val parsed = cleaned.toIntOrNull() ?: 0
                                                viewModel.updateGold(prof.walletGold, prof.bankGold, parsed, currencyText)
                                            },
                                            label = { Text("Долги (-)".loc(), color = ColorTextMuted, fontSize = 10.sp) },
                                            colors = getTextFieldColors(),
                                            modifier = Modifier.weight(1f),
                                            shape = RoundedCornerShape(8.dp),
                                            singleLine = true,
                                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                                        )
                                    }
                                    Spacer(modifier = Modifier.height(6.dp))
                                    OutlinedTextField(
                                        value = currencyText,
                                        onValueChange = {
                                            currencyText = it
                                            viewModel.updateGold(prof.walletGold, prof.bankGold, prof.debtGold, it)
                                        },
                                        placeholder = { Text("20 фан".loc(), color = ColorTextMuted) },
                                        colors = getTextFieldColors(),
                                        modifier = Modifier.fillMaxWidth(),
                                        shape = RoundedCornerShape(8.dp),
                                        singleLine = true
                                    )
                                    Spacer(modifier = Modifier.height(8.dp))
                                    val total = prof.walletGold + prof.bankGold
                                    val net = total - prof.debtGold
                                    val netLabel = "Чистыми".loc()
                                    val totalLabel = "Всего".loc()
                                    Text(
                                        text = "$netLabel: $net · $totalLabel: $total",
                                        color = ColorGoldAccent,
                                        fontSize = 11.sp
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // --- CATEGORIES HORIZONTAL NAVIGATION TABS ---
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    tabs.forEach { tab ->
                        val isSelected = selectedTab == tab
                        val bg = if (isSelected) ColorPurpleAccent else ColorSurfaceDark
                        val fg = if (isSelected) Color.White else ColorTextMuted
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(20.dp))
                                .background(bg)
                                .clickable { selectedTab = tab }
                                .padding(horizontal = 14.dp, vertical = 8.dp)
                        ) {
                            Text(text = tab.loc(), color = fg, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }

            // --- DYNAMIC ACTIVE TAB TAB CONTENT CONTENT ---
            activeProfile?.let { prof ->
                when (selectedTab) {
                    "Черты" -> {
                        item {
                            TabFeaturesContent(
                                features = features,
                                collapsedItemIds = collapsedItemIds,
                                onToggleCollapse = { viewModel.toggleCollapsed(it) },
                                onCollapseAll = { viewModel.collapseAll(it) },
                                onExpandAll = { viewModel.expandAll(it) },
                                onAdd = { t, d -> viewModel.addFeature(t, d) },
                                onDelete = { viewModel.deleteFeature(it) },
                                onMove = { item, up -> viewModel.moveFeature(item, up) },
                                onEdit = { viewModel.editFeature(it) }
                            )
                        }
                    }
                    "Инвентарь" -> {
                        item {
                            TabInventoryContent(
                                items = inventory,
                                collapsedItemIds = collapsedItemIds,
                                onToggleCollapse = { viewModel.toggleCollapsed(it) },
                                onCollapseAll = { viewModel.collapseAll(it) },
                                onExpandAll = { viewModel.expandAll(it) },
                                onAdd = { n, q, w, v, note -> viewModel.addInventoryItem(n, q, w, v, note) },
                                onDelete = { viewModel.deleteInventoryItem(it) },
                                onMove = { item, up -> viewModel.moveInventoryItem(item, up) },
                                onEdit = { viewModel.editInventoryItem(it) }
                            )
                        }
                    }
                    "Эквип" -> {
                        item {
                            TabEquippedContent(
                                items = equipped,
                                collapsedItemIds = collapsedItemIds,
                                onToggleCollapse = { viewModel.toggleCollapsed(it) },
                                onCollapseAll = { viewModel.collapseAll(it) },
                                onExpandAll = { viewModel.expandAll(it) },
                                onAdd = { s, n, note -> viewModel.addEquippedItem(s, n, note) },
                                onDelete = { viewModel.deleteEquippedItem(it) },
                                onMove = { item, up -> viewModel.moveEquippedItem(item, up) },
                                onEdit = { viewModel.editEquippedItem(it) }
                            )
                        }
                    }
                    "Персонажи" -> {
                        item {
                            TabNpcsContent(
                                list = npcs,
                                collapsedItemIds = collapsedItemIds,
                                onToggleCollapse = { viewModel.toggleCollapsed(it) },
                                onCollapseAll = { viewModel.collapseAll(it) },
                                onExpandAll = { viewModel.expandAll(it) },
                                onAdd = { na, ro, fa, lo, re, ta, no -> viewModel.addNpc(na, ro, fa, lo, re, ta, no) },
                                onDelete = { viewModel.deleteNpc(it) },
                                onEdit = { viewModel.editNpc(it) }
                            )
                        }
                    }
                    "Квесты" -> {
                        item {
                            TabQuestsContent(
                                list = quests,
                                collapsedItemIds = collapsedItemIds,
                                onToggleCollapse = { viewModel.toggleCollapsed(it) },
                                onCollapseAll = { viewModel.collapseAll(it) },
                                onExpandAll = { viewModel.expandAll(it) },
                                onAdd = { name, type, d -> viewModel.addQuest(name, type, d) },
                                onUpdateStatus = { q, status -> viewModel.updateQuestStatus(q, status) },
                                onDelete = { viewModel.deleteQuest(it) },
                                onEdit = { viewModel.editQuest(it) }
                            )
                        }
                    }
                    "Зелья" -> {
                        item {
                            TabPotionsContent(
                                list = potions,
                                collapsedItemIds = collapsedItemIds,
                                onToggleCollapse = { viewModel.toggleCollapsed(it) },
                                onCollapseAll = { viewModel.collapseAll(it) },
                                onExpandAll = { viewModel.expandAll(it) },
                                onAdd = { n, q, d -> viewModel.addPotion(n, q, d) },
                                onQtyChange = { p, change -> viewModel.updatePotionQty(p, p.quantity + change) },
                                onDelete = { viewModel.deletePotion(it) },
                                onMove = { p, up -> viewModel.movePotion(p, up) },
                                onEdit = { viewModel.editPotion(it) }
                            )
                        }
                    }
                    "Расходники" -> {
                        item {
                            TabConsumablesContent(
                                list = consumables,
                                collapsedItemIds = collapsedItemIds,
                                onToggleCollapse = { viewModel.toggleCollapsed(it) },
                                onCollapseAll = { viewModel.collapseAll(it) },
                                onExpandAll = { viewModel.expandAll(it) },
                                onAdd = { n, q, d -> viewModel.addConsumable(n, q, d) },
                                onQtyChange = { c, change -> viewModel.updateConsumableQty(c, c.quantity + change) },
                                onDelete = { viewModel.deleteConsumable(it) },
                                onMove = { c, up -> viewModel.moveConsumable(c, up) },
                                onEdit = { viewModel.editConsumable(it) }
                            )
                        }
                    }
                    "Кубы" -> {
                        item {
                            TabDiceContent(
                                notation1 = code1,
                                notation2 = code2,
                                activeMode = mode,
                                activeTarget = activeTarget,
                                lastRolledValue = rolledVal,
                                lastRolledNotation = rolledNot,
                                lastRollFirstVal = rollFirstVal,
                                lastRollSecondVal = rollSecondVal,
                                lastRollType = rollType,
                                lastRollChoice = rollChoice,
                                lastRollFirstDetail = rollFirstDetail,
                                lastRollSecondDetail = rollSecondDetail,
                                lastRollFirstNotation = rollFirstNotation,
                                lastRollSecondNotation = rollSecondNotation,
                                logs = logs,
                                onNotation1Change = { viewModel.diceNotation1.value = it },
                                onNotation2Change = { viewModel.diceNotation2.value = it },
                                onModeChange = { viewModel.activeRollMode.value = it },
                                onTargetChange = { viewModel.activeRollTarget.value = it },
                                onTriggerRoll = { viewModel.triggerRoll() },
                                onRollNotation = { viewModel.rollDice(it) },
                                onClearLogs = { viewModel.clearDiceLogs() }
                            )
                        }
                    }
                    "Заметки" -> {
                        item {
                            TabNotesContent(
                                text = prof.campaignNotes,
                                onSave = { viewModel.updateCampaignNotes(it) }
                            )
                        }
                    }
                    "Статы" -> {
                        item {
                            TabStatsContent(
                                profile = prof,
                                onUpdate = { ac, spy, ini, hpC, hpM, str, dex, con, int, wis, cha ->
                                    viewModel.updateStats(ac, spy, ini, hpC, hpM, str, dex, con, int, wis, cha)
                                }
                            )
                        }
                    }
                    "⚙️" -> {
                        item {
                            TabSettingsContent(
                                profile = prof,
                                currentLanguage = lang,
                                onLanguageChange = { viewModel.setLanguage(it) },
                                onUpdateSettings = { dm, code, nick -> viewModel.updateSettings(dm, code, nick) },
                                onExport = {
                                    val out = viewModel.exportProfileToJson()
                                    clipboardManager.setText(AnnotatedString(out))
                                    Toast.makeText(context, "Скопировано в буфер обмена!".loc(lang), Toast.LENGTH_SHORT).show()
                                    importJsonText = out
                                    showExportDialog = true
                                },
                                onImportClick = {
                                    importJsonText = ""
                                    showImportDialog = true
                                },
                                onReset = { viewModel.resetProfile() }
                            )
                        }
                    }
                }
            }
            
            item {
                Spacer(modifier = Modifier.height(24.dp))
            }
        }
    }

    // Add profile dialog popup
    if (showAddProfileDialog) {
        AlertDialog(
            onDismissRequest = { showAddProfileDialog = false },
            title = { Text("Добавить профиль".loc(), color = Color.White) },
            text = {
                OutlinedTextField(
                    value = newProfileName,
                    onValueChange = { newProfileName = it },
                    placeholder = { Text("Имя нового персонажа".loc(), color = ColorTextMuted) },
                    colors = getTextFieldColors(),
                    singleLine = true
                )
            },
            confirmButton = {
                Button(
                    colors = ButtonDefaults.buttonColors(containerColor = ColorPurpleAccent),
                    onClick = {
                        if (newProfileName.isNotBlank()) {
                            viewModel.createNewProfile(newProfileName)
                            newProfileName = ""
                            showAddProfileDialog = false
                        }
                    }
                ) { Text("Создать".loc()) }
            },
            dismissButton = {
                TextButton(onClick = { showAddProfileDialog = false }) { Text("Отмена".loc(), color = ColorTextMuted) }
            },
            containerColor = ColorSurfaceDark
        )
    }

    // Export Dialog showing copyable text
    if (showExportDialog) {
        Dialog(onDismissRequest = { showExportDialog = false }) {
            Card(
                colors = CardDefaults.cardColors(containerColor = ColorSurfaceDark),
                shape = RoundedCornerShape(12.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Экспорт JSON".loc(), fontWeight = FontWeight.Bold, color = Color.White, fontSize = 16.sp)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("Код скопирован в буфер обмена! Вы можете переслать его другу или сохранить в файл.".loc(), color = ColorTextMuted, fontSize = 12.sp)
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = importJsonText,
                        onValueChange = {},
                        readOnly = true,
                        colors = getTextFieldColors(),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(150.dp)
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Button(
                        onClick = { showExportDialog = false },
                        colors = ButtonDefaults.buttonColors(containerColor = ColorPurpleAccent),
                        modifier = Modifier.align(Alignment.End)
                    ) { Text("Закрыть".loc()) }
                }
            }
        }
    }

    // Import Dialog
    if (showImportDialog) {
        Dialog(onDismissRequest = { showImportDialog = false }) {
            Card(
                colors = CardDefaults.cardColors(containerColor = ColorSurfaceDark),
                shape = RoundedCornerShape(12.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Импорт JSON".loc(), fontWeight = FontWeight.Bold, color = Color.White, fontSize = 16.sp)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("Вставьте экспортированный ранее JSON-код вашего персонажа:".loc(), color = ColorTextMuted, fontSize = 12.sp)
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = importJsonText,
                        onValueChange = { importJsonText = it },
                        placeholder = { Text("Вставьте JSON-код сюда...".loc(), color = ColorTextMuted) },
                        colors = getTextFieldColors(),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(150.dp)
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
                        TextButton(onClick = { showImportDialog = false }) { Text("Отмена".loc(), color = ColorTextMuted) }
                        Spacer(modifier = Modifier.width(8.dp))
                        Button(
                            onClick = {
                                val success = viewModel.importProfileFromJson(importJsonText)
                                if (success) {
                                        Toast.makeText(context, "Импорт успешно выполнен!".loc(lang), Toast.LENGTH_SHORT).show()
                                    showImportDialog = false
                                } else {
                                        Toast.makeText(context, "Ошибка импорта! Проверьте формат JSON.".loc(lang), Toast.LENGTH_SHORT).show()
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = ColorPurpleAccent)
                        ) { Text("Импортировать".loc()) }
                    }
                }
            }
        }
    }

    val crashPrefs = remember { context.getSharedPreferences("crash_prefs", android.content.Context.MODE_PRIVATE) }
    var lastCrash by remember { mutableStateOf(crashPrefs.getString("last_crash", null)) }

    if (lastCrash != null) {
        AlertDialog(
            onDismissRequest = { 
                crashPrefs.edit().remove("last_crash").apply()
                lastCrash = null
            },
            title = { Text("Обнаружен сбой приложения".loc(), color = Color.White, fontWeight = FontWeight.Bold) },
            text = {
                Column {
                    Text("В предыдущем сеансе произошел сбой. Пожалуйста, скопируйте эту информацию об ошибке и отправьте разработчику:".loc(), color = ColorTextMuted, fontSize = 13.sp)
                    Spacer(modifier = Modifier.height(8.dp))
                    androidx.compose.foundation.text.selection.SelectionContainer {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(200.dp)
                                .background(ColorBgDark, shape = RoundedCornerShape(8.dp))
                                .border(1.dp, ColorBorderDark, shape = RoundedCornerShape(8.dp))
                                .padding(8.dp)
                        ) {
                            androidx.compose.foundation.lazy.LazyColumn {
                                item {
                                    Text(
                                        text = lastCrash ?: "",
                                        color = Color.White,
                                        fontSize = 11.sp,
                                        fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace
                                    )
                                }
                            }
                        }
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        clipboardManager.setText(AnnotatedString(lastCrash ?: ""))
                        Toast.makeText(context, "Скопировано в буфер обмена!".loc(lang), Toast.LENGTH_SHORT).show()
                        crashPrefs.edit().remove("last_crash").apply()
                        lastCrash = null
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = ColorPurpleAccent)
                ) { Text("Копировать и Скрыть".loc()) }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        crashPrefs.edit().remove("last_crash").apply()
                        lastCrash = null
                    }
                ) { Text("Скрыть".loc(), color = ColorTextMuted) }
            },
            containerColor = ColorSurfaceDark
        )
    }
}
}

@Composable
fun getTextFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedTextColor = Color.White,
    unfocusedTextColor = Color.White,
    focusedBorderColor = ColorPurpleAccent,
    unfocusedBorderColor = ColorBorderDark,
    focusedContainerColor = ColorBgDark,
    unfocusedContainerColor = ColorBgDark,
    cursorColor = ColorPurpleAccent
)

// --- COMPACT SUB-COMPOSED TAB CONTENTS ---

@Composable
fun FeatureItemView(
    ft: FeatureFeat,
    isCollapsed: Boolean,
    onToggleCollapse: () -> Unit,
    onMove: (FeatureFeat, Boolean) -> Unit,
    onDelete: (FeatureFeat) -> Unit,
    onEdit: (FeatureFeat) -> Unit
) {
    var titleText by remember(ft.id) { mutableStateOf(ft.title) }
    var descText by remember(ft.id) { mutableStateOf(ft.description) }

    LaunchedEffect(ft.title) {
        if (titleText != ft.title) {
            titleText = ft.title
        }
    }
    LaunchedEffect(ft.description) {
        if (descText != ft.description) {
            descText = ft.description
        }
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = ColorSurfaceDark),
        border = BorderStroke(1.dp, ColorBorderDark)
    ) {
        Column(modifier = Modifier.padding(10.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = titleText,
                    onValueChange = {
                        titleText = it
                        onEdit(ft.copy(title = it))
                    },
                    colors = getTextFieldColors(),
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(8.dp),
                    singleLine = true
                )
                Spacer(modifier = Modifier.width(4.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = onToggleCollapse, modifier = Modifier.size(28.dp)) {
                        Icon(if (!isCollapsed) Icons.Default.ArrowDropUp else Icons.Default.ArrowDropDown, contentDescription = "", tint = Color.White, modifier = Modifier.size(20.dp))
                    }
                    IconButton(onClick = { onMove(ft, true) }, modifier = Modifier.size(28.dp)) {
                        Icon(Icons.Default.ArrowUpward, contentDescription = "", tint = ColorTextMuted, modifier = Modifier.size(16.dp))
                    }
                    IconButton(onClick = { onMove(ft, false) }, modifier = Modifier.size(28.dp)) {
                        Icon(Icons.Default.ArrowDownward, contentDescription = "", tint = ColorTextMuted, modifier = Modifier.size(16.dp))
                    }
                    IconButton(onClick = { onDelete(ft) }, modifier = Modifier.size(28.dp)) {
                        Icon(Icons.Default.Close, contentDescription = "", tint = Color.Red.copy(alpha = 0.7f), modifier = Modifier.size(16.dp))
                    }
                }
            }
            if (!isCollapsed) {
                Spacer(modifier = Modifier.height(4.dp))
                OutlinedTextField(
                    value = descText,
                    onValueChange = {
                        descText = it
                        onEdit(ft.copy(description = it))
                    },
                    colors = getTextFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp)
                )
            }
        }
    }
}

@Composable
fun TabFeaturesContent(
    features: List<FeatureFeat>,
    collapsedItemIds: Set<String>,
    onToggleCollapse: (String) -> Unit,
    onCollapseAll: (List<String>) -> Unit,
    onExpandAll: (List<String>) -> Unit,
    onAdd: (String, String) -> Unit,
    onDelete: (FeatureFeat) -> Unit,
    onMove: (FeatureFeat, Boolean) -> Unit,
    onEdit: (FeatureFeat) -> Unit
) {
    var addTitle by remember { mutableStateOf("") }
    var addDesc by remember { mutableStateOf("") }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Черты и особенности".loc(), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                TextButton(onClick = { onCollapseAll(features.map { "feat_${it.id}" }) }) {
                    Text("Свернуть все".loc(), color = ColorPurpleAccent, fontSize = 11.sp)
                }
                TextButton(onClick = { onExpandAll(features.map { "feat_${it.id}" }) }) {
                    Text("Развернуть все".loc(), color = ColorPurpleAccent, fontSize = 11.sp)
                }
            }
        }
        
        features.forEach { ft ->
            androidx.compose.runtime.key(ft.id) {
                FeatureItemView(
                    ft = ft,
                    isCollapsed = collapsedItemIds.contains("feat_${ft.id}"),
                    onToggleCollapse = { onToggleCollapse("feat_${ft.id}") },
                    onMove = onMove,
                    onDelete = onDelete,
                    onEdit = onEdit
                )
            }
        }

        // Inline quick add
        Card(colors = CardDefaults.cardColors(containerColor = ColorSurfaceDark)) {
            Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Добавить черту".loc(), color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                OutlinedTextField(
                    value = addTitle,
                    onValueChange = { addTitle = it },
                    placeholder = { Text("Название пассивки...".loc(), color = ColorTextMuted) },
                    colors = getTextFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                    singleLine = true
                )
                OutlinedTextField(
                    value = addDesc,
                    onValueChange = { addDesc = it },
                    placeholder = { Text("Описание...".loc(), color = ColorTextMuted) },
                    colors = getTextFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp)
                )
                Button(
                    onClick = {
                        if (addTitle.isNotBlank()) {
                            onAdd(addTitle, addDesc)
                            addTitle = ""
                            addDesc = ""
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = ColorPurpleAccent),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("+ Добавить".loc())
                }
            }
        }
    }
}

@Composable
fun InventoryItemCard(
    item: InventoryItem,
    isCollapsed: Boolean,
    onToggleCollapse: () -> Unit,
    onDelete: (InventoryItem) -> Unit,
    onMove: (InventoryItem, Boolean) -> Unit,
    onEdit: (InventoryItem) -> Unit
) {
    var nameText by remember(item.id) { mutableStateOf(item.name) }
    var qtyText by remember(item.id) { mutableStateOf(item.quantity.toString()) }
    var weightText by remember(item.id) { mutableStateOf(item.weight.toString()) }
    var valText by remember(item.id) { mutableStateOf(item.value.toString()) }
    var notesText by remember(item.id) { mutableStateOf(item.notes) }

    LaunchedEffect(item.name) {
        if (nameText != item.name) {
            nameText = item.name
        }
    }
    LaunchedEffect(item.quantity) {
        if (qtyText != item.quantity.toString()) {
            qtyText = item.quantity.toString()
        }
    }
    LaunchedEffect(item.weight) {
        if (weightText != item.weight.toString()) {
            weightText = item.weight.toString()
        }
    }
    LaunchedEffect(item.value) {
        if (valText != item.value.toString()) {
            valText = item.value.toString()
        }
    }
    LaunchedEffect(item.notes) {
        if (notesText != item.notes) {
            notesText = item.notes
        }
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = ColorSurfaceDark),
        border = BorderStroke(1.dp, ColorBorderDark)
    ) {
        Column(modifier = Modifier.padding(10.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = nameText,
                    onValueChange = {
                        nameText = it
                        onEdit(item.copy(name = it))
                    },
                    colors = getTextFieldColors(),
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(8.dp),
                    singleLine = true
                )
                Spacer(modifier = Modifier.width(4.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = onToggleCollapse, modifier = Modifier.size(28.dp)) {
                        Icon(if (!isCollapsed) Icons.Default.ArrowDropUp else Icons.Default.ArrowDropDown, contentDescription = "", tint = Color.White, modifier = Modifier.size(20.dp))
                    }
                    IconButton(onClick = { onMove(item, true) }, modifier = Modifier.size(28.dp)) {
                        Icon(Icons.Default.ArrowUpward, contentDescription = "", tint = ColorTextMuted, modifier = Modifier.size(16.dp))
                    }
                    IconButton(onClick = { onMove(item, false) }, modifier = Modifier.size(28.dp)) {
                        Icon(Icons.Default.ArrowDownward, contentDescription = "", tint = ColorTextMuted, modifier = Modifier.size(16.dp))
                    }
                    IconButton(onClick = { onDelete(item) }, modifier = Modifier.size(28.dp)) {
                        Icon(Icons.Default.Close, contentDescription = "", tint = Color.Red.copy(alpha = 0.7f), modifier = Modifier.size(16.dp))
                    }
                }
            }
            if (!isCollapsed) {
                Spacer(modifier = Modifier.height(4.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    OutlinedTextField(
                        value = qtyText,
                        onValueChange = { newValue ->
                            val cleaned = newValue.filter { it.isDigit() }
                            qtyText = cleaned
                            val parsed = cleaned.toIntOrNull()
                            if (parsed != null) {
                                onEdit(item.copy(quantity = parsed))
                            }
                        },
                        colors = getTextFieldColors(),
                        label = { Text("Кол-во".loc(), color = ColorTextMuted, fontSize = 9.sp) },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(8.dp),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = weightText,
                        onValueChange = { newValue ->
                            val cleaned = newValue.filter { it.isDigit() || it == '.' }
                            weightText = cleaned
                            val parsed = cleaned.toDoubleOrNull()
                            if (parsed != null) {
                                onEdit(item.copy(weight = parsed))
                            }
                        },
                        colors = getTextFieldColors(),
                        label = { Text("Вес".loc(), color = ColorTextMuted, fontSize = 9.sp) },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(8.dp),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = valText,
                        onValueChange = { newValue ->
                            val cleaned = newValue.filter { it.isDigit() }
                            valText = cleaned
                            val parsed = cleaned.toIntOrNull()
                            if (parsed != null) {
                                onEdit(item.copy(value = parsed))
                            }
                        },
                        colors = getTextFieldColors(),
                        label = { Text("Ценность".loc(), color = ColorTextMuted, fontSize = 9.sp) },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(8.dp),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true
                    )
                }
                Spacer(modifier = Modifier.height(4.dp))
                OutlinedTextField(
                    value = notesText,
                    onValueChange = {
                        notesText = it
                        onEdit(item.copy(notes = it))
                    },
                    placeholder = { Text("Заметки...".loc(), color = ColorTextMuted) },
                    colors = getTextFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                    singleLine = true
                )
            }
        }
    }
}

@Composable
fun TabInventoryContent(
    items: List<InventoryItem>,
    collapsedItemIds: Set<String>,
    onToggleCollapse: (String) -> Unit,
    onCollapseAll: (List<String>) -> Unit,
    onExpandAll: (List<String>) -> Unit,
    onAdd: (String, Int, Double, Int, String) -> Unit,
    onDelete: (InventoryItem) -> Unit,
    onMove: (InventoryItem, Boolean) -> Unit,
    onEdit: (InventoryItem) -> Unit
) {
    var addName by remember { mutableStateOf("") }
    var addQty by remember { mutableStateOf("1") }
    var addWeight by remember { mutableStateOf("0.0") }
    var addVal by remember { mutableStateOf("0") }
    var addNote by remember { mutableStateOf("") }

    val totalWeight = items.sumOf { it.quantity * it.weight }
    val totalCount = items.sumOf { it.quantity }
    val totalValue = items.sumOf { it.quantity * it.value }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text("Список предметов".loc(), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                Text(
                    text = "$totalCount${" шт".loc()} · ${String.format(Locale.US, "%.1f", totalWeight)}${" кг".loc()} · $totalValue${" зм".loc()}",
                    color = ColorTextMuted,
                    fontSize = 11.sp
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                TextButton(onClick = { onCollapseAll(items.map { "inv_${it.id}" }) }) {
                    Text("Свернуть все".loc(), color = ColorPurpleAccent, fontSize = 11.sp)
                }
                TextButton(onClick = { onExpandAll(items.map { "inv_${it.id}" }) }) {
                    Text("Развернуть все".loc(), color = ColorPurpleAccent, fontSize = 11.sp)
                }
            }
        }

        items.forEach { item ->
            androidx.compose.runtime.key(item.id) {
                InventoryItemCard(
                    item = item,
                    isCollapsed = collapsedItemIds.contains("inv_${item.id}"),
                    onToggleCollapse = { onToggleCollapse("inv_${item.id}") },
                    onDelete = onDelete,
                    onMove = onMove,
                    onEdit = onEdit
                )
            }
        }

        // Inline Add Inventory Form
        Card(colors = CardDefaults.cardColors(containerColor = ColorSurfaceDark)) {
            Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Добавить предмет".loc(), color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                OutlinedTextField(
                    value = addName,
                    onValueChange = { addName = it },
                    placeholder = { Text("Название предмета...".loc(), color = ColorTextMuted) },
                    colors = getTextFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                    singleLine = true
                )
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    OutlinedTextField(
                        value = addQty,
                        onValueChange = { addQty = it },
                        label = { Text("Кол-во".loc(), color = ColorTextMuted) },
                        colors = getTextFieldColors(),
                        shape = RoundedCornerShape(8.dp),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = addWeight,
                        onValueChange = { addWeight = it },
                        label = { Text("Вес".loc(), color = ColorTextMuted) },
                        colors = getTextFieldColors(),
                        shape = RoundedCornerShape(8.dp),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = addVal,
                        onValueChange = { addVal = it },
                        label = { Text("Ценность".loc(), color = ColorTextMuted) },
                        colors = getTextFieldColors(),
                        shape = RoundedCornerShape(8.dp),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                        singleLine = true
                    )
                }
                OutlinedTextField(
                    value = addNote,
                    onValueChange = { addNote = it },
                    placeholder = { Text("Заметки...".loc(), color = ColorTextMuted) },
                    colors = getTextFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                    singleLine = true
                )
                Button(
                    onClick = {
                        if (addName.isNotBlank()) {
                            onAdd(addName, addQty.toIntOrNull() ?: 1, addWeight.toDoubleOrNull() ?: 0.0, addVal.toIntOrNull() ?: 0, addNote)
                            addName = ""
                            addQty = "1"
                            addWeight = "0.0"
                            addVal = "0"
                            addNote = ""
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = ColorPurpleAccent),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("+ Добавить".loc())
                }
            }
        }
    }
}

@Composable
fun EquippedItemCard(
    eq: EquippedItem,
    isCollapsed: Boolean,
    onToggleCollapse: () -> Unit,
    onMove: (EquippedItem, Boolean) -> Unit,
    onDelete: (EquippedItem) -> Unit,
    onEdit: (EquippedItem) -> Unit
) {
    val slots = listOf("Оружие 1", "Оружие 2", "Доспех", "Щит", "Кольцо 1", "Кольцо 2", "Амулет", "Шлем", "Плащ", "Перчатки", "Сапоги")
    var nameText by remember(eq.id) { mutableStateOf(eq.name) }
    var notesText by remember(eq.id) { mutableStateOf(eq.notes) }
    var slotText by remember(eq.id) { mutableStateOf(eq.slot) }
    var slotDropdownExpanded by remember { mutableStateOf(false) }

    LaunchedEffect(eq.name) {
        if (nameText != eq.name) nameText = eq.name
    }
    LaunchedEffect(eq.notes) {
        if (notesText != eq.notes) notesText = eq.notes
    }
    LaunchedEffect(eq.slot) {
        if (slotText != eq.slot) slotText = eq.slot
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = ColorSurfaceDark),
        border = BorderStroke(1.dp, ColorBorderDark)
    ) {
        Column(modifier = Modifier.padding(10.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(modifier = Modifier.weight(1f)) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(ColorBgDark, RoundedCornerShape(8.dp))
                            .clickable { slotDropdownExpanded = true }
                            .padding(horizontal = 8.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(slotText.loc(), color = ColorPurpleAccent, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                        Icon(Icons.Default.ArrowDropDown, contentDescription = "", tint = ColorTextMuted, modifier = Modifier.size(16.dp))
                    }
                    DropdownMenu(
                        expanded = slotDropdownExpanded,
                        onDismissRequest = { slotDropdownExpanded = false },
                        modifier = Modifier.background(ColorSurfaceDark)
                    ) {
                        slots.forEach { slot ->
                            DropdownMenuItem(
                                text = { Text(slot.loc(), color = Color.White) },
                                onClick = {
                                    slotText = slot
                                    slotDropdownExpanded = false
                                    onEdit(eq.copy(slot = slot))
                                }
                            )
                        }
                    }
                }
                Spacer(modifier = Modifier.width(4.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = onToggleCollapse, modifier = Modifier.size(28.dp)) {
                        Icon(if (!isCollapsed) Icons.Default.ArrowDropUp else Icons.Default.ArrowDropDown, contentDescription = "", tint = Color.White, modifier = Modifier.size(20.dp))
                    }
                    IconButton(onClick = { onMove(eq, true) }, modifier = Modifier.size(28.dp)) {
                        Icon(Icons.Default.ArrowUpward, contentDescription = "", tint = ColorTextMuted, modifier = Modifier.size(16.dp))
                    }
                    IconButton(onClick = { onMove(eq, false) }, modifier = Modifier.size(28.dp)) {
                        Icon(Icons.Default.ArrowDownward, contentDescription = "", tint = ColorTextMuted, modifier = Modifier.size(16.dp))
                    }
                    IconButton(onClick = { onDelete(eq) }, modifier = Modifier.size(28.dp)) {
                        Icon(Icons.Default.Close, contentDescription = "", tint = Color.Red.copy(alpha = 0.7f), modifier = Modifier.size(16.dp))
                    }
                }
            }
            Spacer(modifier = Modifier.height(4.dp))
            OutlinedTextField(
                value = nameText,
                onValueChange = {
                    nameText = it
                    onEdit(eq.copy(name = it))
                },
                colors = getTextFieldColors(),
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(8.dp),
                singleLine = true
            )
            if (!isCollapsed) {
                Spacer(modifier = Modifier.height(4.dp))
                OutlinedTextField(
                    value = notesText,
                    onValueChange = {
                        notesText = it
                        onEdit(eq.copy(notes = it))
                    },
                    placeholder = { Text("Заметки (урон, эффекты)...".loc(), color = ColorTextMuted) },
                    colors = getTextFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                    singleLine = true
                )
            }
        }
    }
}

@Composable
fun TabEquippedContent(
    items: List<EquippedItem>,
    collapsedItemIds: Set<String>,
    onToggleCollapse: (String) -> Unit,
    onCollapseAll: (List<String>) -> Unit,
    onExpandAll: (List<String>) -> Unit,
    onAdd: (String, String, String) -> Unit,
    onDelete: (EquippedItem) -> Unit,
    onMove: (EquippedItem, Boolean) -> Unit,
    onEdit: (EquippedItem) -> Unit
) {
    val slots = listOf("Оружие 1", "Оружие 2", "Доспех", "Щит", "Кольцо 1", "Кольцо 2", "Амулет", "Шлем", "Плащ", "Перчатки", "Сапоги")
    
    var selectedSlot by remember { mutableStateOf("Оружие 1") }
    var addName by remember { mutableStateOf("") }
    var addNote by remember { mutableStateOf("") }
    var slotDropdownExpanded by remember { mutableStateOf(false) }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Надетые предметы".loc(), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                TextButton(onClick = { onCollapseAll(items.map { "equip_${it.id}" }) }) {
                    Text("Свернуть все".loc(), color = ColorPurpleAccent, fontSize = 11.sp)
                }
                TextButton(onClick = { onExpandAll(items.map { "equip_${it.id}" }) }) {
                    Text("Развернуть все".loc(), color = ColorPurpleAccent, fontSize = 11.sp)
                }
            }
        }

        items.forEach { eq ->
            androidx.compose.runtime.key(eq.id) {
                EquippedItemCard(
                    eq = eq,
                    isCollapsed = collapsedItemIds.contains("equip_${eq.id}"),
                    onToggleCollapse = { onToggleCollapse("equip_${eq.id}") },
                    onMove = onMove,
                    onDelete = onDelete,
                    onEdit = onEdit
                )
            }
        }

        // Add Equipped Form
        Card(colors = CardDefaults.cardColors(containerColor = ColorSurfaceDark)) {
            Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Надеть снаряжение".loc(), color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(ColorBgDark, RoundedCornerShape(8.dp))
                        .clickable { slotDropdownExpanded = true }
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(selectedSlot.loc(), color = Color.White)
                    Icon(Icons.Default.ArrowDropDown, contentDescription = "", tint = ColorTextMuted)
                }

                DropdownMenu(
                    expanded = slotDropdownExpanded,
                    onDismissRequest = { slotDropdownExpanded = false },
                    modifier = Modifier.background(ColorSurfaceDark)
                ) {
                    slots.forEach { slot ->
                        DropdownMenuItem(
                            text = { Text(slot.loc(), color = Color.White) },
                            onClick = {
                                selectedSlot = slot
                                slotDropdownExpanded = false
                            }
                        )
                    }
                }

                OutlinedTextField(
                    value = addName,
                    onValueChange = { addName = it },
                    placeholder = { Text("Название предмета (например, Длинный лук у...)".loc(), color = ColorTextMuted) },
                    colors = getTextFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                    singleLine = true
                )

                OutlinedTextField(
                    value = addNote,
                    onValueChange = { addNote = it },
                    placeholder = { Text("Заметки (урон, эффекты)...".loc(), color = ColorTextMuted) },
                    colors = getTextFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                    singleLine = true
                )

                Button(
                    onClick = {
                        if (addName.isNotBlank() && selectedSlot.isNotBlank()) {
                            onAdd(selectedSlot, addName, addNote)
                            addName = ""
                            addNote = ""
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = ColorPurpleAccent),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("+ Надеть".loc())
                }
            }
        }
    }
}

@Composable
fun NpcItemCard(
    npc: NpcCharacter,
    isCollapsed: Boolean,
    onToggleCollapse: () -> Unit,
    onDelete: (NpcCharacter) -> Unit,
    onEdit: (NpcCharacter) -> Unit
) {
    val relationships = listOf("Дружел.", "Нейтр.", "Враждеб.")
    var nameText by remember(npc.id) { mutableStateOf(npc.name) }
    var roleText by remember(npc.id) { mutableStateOf(npc.role) }
    var factionText by remember(npc.id) { mutableStateOf(npc.faction) }
    var locationText by remember(npc.id) { mutableStateOf(npc.location) }
    var tagsText by remember(npc.id) { mutableStateOf(npc.tags) }
    var notesText by remember(npc.id) { mutableStateOf(npc.notes) }
    var relationshipText by remember(npc.id) { mutableStateOf(npc.relationship) }

    LaunchedEffect(npc.name) {
        if (nameText != npc.name) nameText = npc.name
    }
    LaunchedEffect(npc.role) {
        if (roleText != npc.role) roleText = npc.role
    }
    LaunchedEffect(npc.faction) {
        if (factionText != npc.faction) factionText = npc.faction
    }
    LaunchedEffect(npc.location) {
        if (locationText != npc.location) locationText = npc.location
    }
    LaunchedEffect(npc.tags) {
        if (tagsText != npc.tags) tagsText = npc.tags
    }
    LaunchedEffect(npc.notes) {
        if (notesText != npc.notes) notesText = npc.notes
    }
    LaunchedEffect(npc.relationship) {
        if (relationshipText != npc.relationship) relationshipText = npc.relationship
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = ColorSurfaceDark),
        border = BorderStroke(1.dp, ColorBorderDark)
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(nameText.ifBlank { "Персонаж" }.loc(), color = ColorPurpleAccent, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    IconButton(onClick = onToggleCollapse, modifier = Modifier.size(24.dp)) {
                        Icon(if (!isCollapsed) Icons.Default.ArrowDropUp else Icons.Default.ArrowDropDown, contentDescription = "", tint = Color.White, modifier = Modifier.size(20.dp))
                    }
                    val relColor = when (relationshipText) {
                        "Дружел." -> Color(0xFF4CAF50)
                        "Враждеб." -> Color(0xFFF44336)
                        else -> ColorTextMuted
                    }
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(relColor.copy(alpha = 0.2f))
                            .clickable {
                                var targetIdx = relationships.indexOf(relationshipText) + 1
                                if (targetIdx >= relationships.size) targetIdx = 0
                                val nextRel = relationships[targetIdx]
                                relationshipText = nextRel
                                onEdit(npc.copy(relationship = nextRel))
                            }
                            .padding(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Text(relationshipText.loc(), color = relColor, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                    }

                    IconButton(onClick = { onDelete(npc) }, modifier = Modifier.size(24.dp)) {
                        Icon(Icons.Default.Close, contentDescription = "", tint = Color.Red.copy(alpha = 0.7f), modifier = Modifier.size(16.dp))
                    }
                }
            }

            if (!isCollapsed) {
                OutlinedTextField(
                    value = nameText,
                    onValueChange = {
                        nameText = it
                        onEdit(npc.copy(name = it))
                    },
                    placeholder = { Text("Имя...".loc(), color = ColorTextMuted) },
                    colors = getTextFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                    singleLine = true
                )

                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    OutlinedTextField(
                        value = roleText,
                        onValueChange = {
                            roleText = it
                            onEdit(npc.copy(role = it))
                        },
                        placeholder = { Text("Роль/Класс...".loc(), color = ColorTextMuted) },
                        colors = getTextFieldColors(),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.weight(1f),
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = factionText,
                        onValueChange = {
                            factionText = it
                            onEdit(npc.copy(faction = it))
                        },
                        placeholder = { Text("Фракция...".loc(), color = ColorTextMuted) },
                        colors = getTextFieldColors(),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.weight(1f),
                        singleLine = true
                    )
                }

                OutlinedTextField(
                    value = locationText,
                    onValueChange = {
                        locationText = it
                        onEdit(npc.copy(location = it))
                    },
                    placeholder = { Text("Локация...".loc(), color = ColorTextMuted) },
                    colors = getTextFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                    singleLine = true
                )

                OutlinedTextField(
                    value = tagsText,
                    onValueChange = {
                        tagsText = it
                        onEdit(npc.copy(tags = it))
                    },
                    placeholder = { Text("Теги (через запятую)...".loc(), color = ColorTextMuted) },
                    colors = getTextFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                    singleLine = true
                )

                OutlinedTextField(
                    value = notesText,
                    onValueChange = {
                        notesText = it
                        onEdit(npc.copy(notes = it))
                    },
                    placeholder = { Text("Особые заметки...".loc(), color = ColorTextMuted) },
                    colors = getTextFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp)
                )
            }
        }
    }
}

@Composable
fun TabNpcsContent(
    list: List<NpcCharacter>,
    collapsedItemIds: Set<String>,
    onToggleCollapse: (String) -> Unit,
    onCollapseAll: (List<String>) -> Unit,
    onExpandAll: (List<String>) -> Unit,
    onAdd: (String, String, String, String, String, String, String) -> Unit,
    onDelete: (NpcCharacter) -> Unit,
    onEdit: (NpcCharacter) -> Unit
) {
    var searchQuery by remember { mutableStateOf("") }
    var searchRelation by remember { mutableStateOf("Все") }
    var relDropdownExpanded by remember { mutableStateOf(false) }

    var addName by remember { mutableStateOf("") }
    var addRole by remember { mutableStateOf("") }
    var addFaction by remember { mutableStateOf("") }
    var addLocation by remember { mutableStateOf("") }
    var addRelation by remember { mutableStateOf("Дружел.") }
    var addTags by remember { mutableStateOf("") }
    var addNotes by remember { mutableStateOf("") }

    val relationships = listOf("Дружел.", "Нейтр.", "Враждеб.")
    val filterOptions = listOf("Все", "Дружел.", "Нейтр.", "Враждеб.")

    val filtered = list.filter { npc ->
        (npc.name.contains(searchQuery, true) || npc.role.contains(searchQuery, true) || npc.notes.contains(searchQuery, true)) &&
                (searchRelation == "Все" || npc.relationship == searchRelation)
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("${"Персонажи".loc()} (${filtered.size})", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                TextButton(onClick = { onCollapseAll(list.map { "npc_${it.id}" }) }) {
                    Text("Свернуть все".loc(), color = ColorPurpleAccent, fontSize = 11.sp)
                }
                TextButton(onClick = { onExpandAll(list.map { "npc_${it.id}" }) }) {
                    Text("Развернуть все".loc(), color = ColorPurpleAccent, fontSize = 11.sp)
                }
            }
        }

        // Search inputs
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                placeholder = { Text("Поиск...".loc(), color = ColorTextMuted) },
                colors = getTextFieldColors(),
                modifier = Modifier.weight(1.5f),
                shape = RoundedCornerShape(8.dp),
                singleLine = true
            )
            Box(
                modifier = Modifier
                    .weight(1f)
                    .background(ColorSurfaceDark, RoundedCornerShape(8.dp))
                    .clickable { relDropdownExpanded = true }
                    .padding(horizontal = 10.dp, vertical = 12.dp)
            ) {
                Row(horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                    Text(searchRelation.loc(), color = Color.White, fontSize = 13.sp)
                    Icon(Icons.Default.ArrowDropDown, contentDescription = "", tint = ColorTextMuted, modifier = Modifier.size(16.dp))
                }
                DropdownMenu(
                    expanded = relDropdownExpanded,
                    onDismissRequest = { relDropdownExpanded = false },
                    modifier = Modifier.background(ColorSurfaceDark)
                ) {
                    filterOptions.forEach { opt ->
                        DropdownMenuItem(
                            text = { Text(opt.loc(), color = Color.White) },
                            onClick = {
                                searchRelation = opt
                                relDropdownExpanded = false
                            }
                        )
                    }
                }
            }
        }

        if (filtered.isEmpty()) {
            Text(
                "Нет персонажей".loc(),
                color = ColorTextMuted,
                fontSize = 14.sp,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 16.dp),
                textAlign = TextAlign.Center
            )
        } else {
            filtered.forEach { npc ->
                androidx.compose.runtime.key(npc.id) {
                    NpcItemCard(
                        npc = npc,
                        isCollapsed = collapsedItemIds.contains("npc_${npc.id}"),
                        onToggleCollapse = { onToggleCollapse("npc_${npc.id}") },
                        onDelete = onDelete,
                        onEdit = onEdit
                    )
                }
            }
        }

        // Add NPC panel
        Card(colors = CardDefaults.cardColors(containerColor = ColorSurfaceDark)) {
            Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Добавить персонажа / NPC".loc(), color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                OutlinedTextField(
                    value = addName,
                    onValueChange = { addName = it },
                    placeholder = { Text("Имя...".loc(), color = ColorTextMuted) },
                    colors = getTextFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                    singleLine = true
                )
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    OutlinedTextField(
                        value = addRole,
                        onValueChange = { addRole = it },
                        placeholder = { Text("Роль/Класс...".loc(), color = ColorTextMuted) },
                        colors = getTextFieldColors(),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.weight(1f),
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = addFaction,
                        onValueChange = { addFaction = it },
                        placeholder = { Text("Фракция...".loc(), color = ColorTextMuted) },
                        colors = getTextFieldColors(),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.weight(1f),
                        singleLine = true
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    OutlinedTextField(
                        value = addLocation,
                        onValueChange = { addLocation = it },
                        placeholder = { Text("Локация...".loc(), color = ColorTextMuted) },
                        colors = getTextFieldColors(),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.weight(1.5f),
                        singleLine = true
                    )
                    Box(modifier = Modifier
                        .weight(1f)
                        .background(ColorBgDark, RoundedCornerShape(8.dp))
                        .clickable {
                            var targetIdx = relationships.indexOf(addRelation) + 1
                            if (targetIdx >= relationships.size) targetIdx = 0
                            addRelation = relationships[targetIdx]
                        }
                        .padding(horizontal = 8.dp, vertical = 14.dp)
                    ) {
                        Text(addRelation.loc(), color = Color.White, fontSize = 12.sp, modifier = Modifier.align(Alignment.Center))
                    }
                }
                
                OutlinedTextField(
                    value = addTags,
                    onValueChange = { addTags = it },
                    placeholder = { Text("Теги (через запятую)...".loc(), color = ColorTextMuted) },
                    colors = getTextFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                    singleLine = true
                )
                OutlinedTextField(
                    value = addNotes,
                    onValueChange = { addNotes = it },
                    placeholder = { Text("Особые заметки...".loc(), color = ColorTextMuted) },
                    colors = getTextFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp)
                )

                Button(
                    onClick = {
                        if (addName.isNotBlank()) {
                            onAdd(addName, addRole, addFaction, addLocation, addRelation, addTags, addNotes)
                            addName = ""
                            addRole = ""
                            addFaction = ""
                            addLocation = ""
                            addTags = ""
                            addNotes = ""
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = ColorPurpleAccent),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("+ Добавить".loc())
                }
            }
        }
    }
}

@Composable
fun QuestItemCard(
    qt: Quest,
    isCollapsed: Boolean,
    onToggleCollapse: () -> Unit,
    onUpdateStatus: (Quest, String) -> Unit,
    onDelete: (Quest) -> Unit,
    onEdit: (Quest) -> Unit
) {
    var nameText by remember(qt.id) { mutableStateOf(qt.name) }
    var typeText by remember(qt.id) { mutableStateOf(qt.type) }
    var descText by remember(qt.id) { mutableStateOf(qt.description) }

    LaunchedEffect(qt.name) {
        if (nameText != qt.name) nameText = qt.name
    }
    LaunchedEffect(qt.type) {
        if (typeText != qt.type) typeText = qt.type
    }
    LaunchedEffect(qt.description) {
        if (descText != qt.description) descText = qt.description
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = ColorSurfaceDark),
        border = BorderStroke(1.dp, ColorBorderDark)
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(
                horizontalArrangement = Arrangement.SpaceBetween, 
                modifier = Modifier.fillMaxWidth(), 
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(nameText.ifBlank { "Квест" }.loc(), color = ColorPurpleAccent, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    IconButton(onClick = onToggleCollapse, modifier = Modifier.size(24.dp)) {
                        Icon(if (!isCollapsed) Icons.Default.ArrowDropUp else Icons.Default.ArrowDropDown, contentDescription = "", tint = Color.White, modifier = Modifier.size(20.dp))
                    }
                    IconButton(onClick = { onDelete(qt) }, modifier = Modifier.size(24.dp)) {
                        Icon(Icons.Default.Close, contentDescription = "", tint = Color.Red.copy(alpha = 0.7f), modifier = Modifier.size(16.dp))
                    }
                }
            }

            if (!isCollapsed) {
                OutlinedTextField(
                    value = nameText,
                    onValueChange = {
                        nameText = it
                        onEdit(qt.copy(name = it))
                    },
                    placeholder = { Text("Название квеста...".loc(), color = ColorTextMuted) },
                    colors = getTextFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                    singleLine = true
                )

                OutlinedTextField(
                    value = typeText,
                    onValueChange = {
                        typeText = it
                        onEdit(qt.copy(type = it))
                    },
                    placeholder = { Text("Сюжет / побочка...".loc(), color = ColorTextMuted) },
                    colors = getTextFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                    singleLine = true
                )

                OutlinedTextField(
                    value = descText,
                    onValueChange = {
                        descText = it
                        onEdit(qt.copy(description = it))
                    },
                    placeholder = { Text("Описание квеста...".loc(), color = ColorTextMuted) },
                    colors = getTextFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp)
                )

                // Status Switcher
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    listOf("Активный", "Завершённый", "Проваленный").forEach { st ->
                        val selected = qt.status == st
                        val col = when(st) {
                            "Завершённый" -> Color(0xFF4CAF50)
                            "Проваленный" -> Color(0xFFF44336)
                            else -> ColorTextMuted
                        }
                        val bg = if (selected) col.copy(alpha = 0.3f) else ColorBgDark
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .background(bg)
                                .clickable { onUpdateStatus(qt, st) }
                                .padding(horizontal = 10.dp, vertical = 6.dp)
                        ) {
                            Text(st.loc(), color = if (selected) col else ColorTextMuted, fontSize = 11.sp)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun TabQuestsContent(
    list: List<Quest>,
    collapsedItemIds: Set<String>,
    onToggleCollapse: (String) -> Unit,
    onCollapseAll: (List<String>) -> Unit,
    onExpandAll: (List<String>) -> Unit,
    onAdd: (String, String, String) -> Unit,
    onUpdateStatus: (Quest, String) -> Unit,
    onDelete: (Quest) -> Unit,
    onEdit: (Quest) -> Unit
) {
    var addName by remember { mutableStateOf("") }
    var addType by remember { mutableStateOf("Сюжет / побочка") }
    var addDesc by remember { mutableStateOf("") }

    val activeCount = list.count { it.status == "Активный" }
    val successCount = list.count { it.status == "Завершённый" }
    val failedCount = list.count { it.status == "Проваленный" }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Журнал квестов".loc(), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                TextButton(onClick = { onCollapseAll(list.map { "quest_${it.id}" }) }) {
                    Text("Свернуть все".loc(), color = ColorPurpleAccent, fontSize = 11.sp)
                }
                TextButton(onClick = { onExpandAll(list.map { "quest_${it.id}" }) }) {
                    Text("Развернуть все".loc(), color = ColorPurpleAccent, fontSize = 11.sp)
                }
            }
        }

        // Count chips
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
            AssistChip(
                onClick = {}, 
                label = { Text("${"Активные: ".loc()}$activeCount") }, 
                colors = AssistChipDefaults.assistChipColors(labelColor = Color.White, containerColor = ColorSurfaceDark)
            )
            AssistChip(
                onClick = {}, 
                label = { Text("${"Завершённые: ".loc()}$successCount") }, 
                colors = AssistChipDefaults.assistChipColors(labelColor = Color(0xFF4CAF50), containerColor = ColorSurfaceDark)
            )
            AssistChip(
                onClick = {}, 
                label = { Text("${"Проваленные: ".loc()}$failedCount") }, 
                colors = AssistChipDefaults.assistChipColors(labelColor = Color(0xFFF44336), containerColor = ColorSurfaceDark)
            )
        }

        if (list.isEmpty()) {
            Text("Нет квестов".loc(), color = ColorTextMuted, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp))
        } else {
            list.forEach { qt ->
                androidx.compose.runtime.key(qt.id) {
                    QuestItemCard(
                        qt = qt,
                        isCollapsed = collapsedItemIds.contains("quest_${qt.id}"),
                        onToggleCollapse = { onToggleCollapse("quest_${qt.id}") },
                        onUpdateStatus = onUpdateStatus,
                        onDelete = onDelete,
                        onEdit = onEdit
                    )
                }
            }
        }

        Card(colors = CardDefaults.cardColors(containerColor = ColorSurfaceDark)) {
            Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Добавить квест".loc(), color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                OutlinedTextField(
                    value = addName,
                    onValueChange = { addName = it },
                    placeholder = { Text("Название квеста...".loc(), color = ColorTextMuted) },
                    colors = getTextFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                    singleLine = true
                )
                OutlinedTextField(
                    value = addType,
                    onValueChange = { addType = it },
                    placeholder = { Text("Сюжет / побочка...".loc(), color = ColorTextMuted) },
                    colors = getTextFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                    singleLine = true
                )
                OutlinedTextField(
                    value = addDesc,
                    onValueChange = { addDesc = it },
                    placeholder = { Text("Описание квеста...".loc(), color = ColorTextMuted) },
                    colors = getTextFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp)
                )

                Button(
                    onClick = {
                        if (addName.isNotBlank()) {
                            onAdd(addName, addType, addDesc)
                            addName = ""
                            addDesc = ""
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = ColorPurpleAccent),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("+ Добавить".loc())
                }
            }
        }
    }
}

@Composable
fun PotionItemCard(
    pot: Potion,
    isCollapsed: Boolean,
    onToggleCollapse: () -> Unit,
    onQtyChange: (Potion, Int) -> Unit,
    onDelete: (Potion) -> Unit,
    onMove: (Potion, Boolean) -> Unit,
    onEdit: (Potion) -> Unit
) {
    var nameText by remember(pot.id) { mutableStateOf(pot.name) }
    var descText by remember(pot.id) { mutableStateOf(pot.description) }

    LaunchedEffect(pot.name) {
        if (nameText != pot.name) {
            nameText = pot.name
        }
    }
    LaunchedEffect(pot.description) {
        if (descText != pot.description) {
            descText = pot.description
        }
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = ColorSurfaceDark),
        border = BorderStroke(1.dp, ColorBorderDark)
    ) {
        Column(modifier = Modifier.padding(10.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = nameText,
                    onValueChange = {
                        nameText = it
                        onEdit(pot.copy(name = it))
                    },
                    colors = getTextFieldColors(),
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(8.dp),
                    singleLine = true
                )
                Spacer(modifier = Modifier.width(4.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = onToggleCollapse, modifier = Modifier.size(24.dp)) {
                        Icon(if (!isCollapsed) Icons.Default.ArrowDropUp else Icons.Default.ArrowDropDown, contentDescription = "", tint = Color.White, modifier = Modifier.size(20.dp))
                    }
                    IconButton(onClick = { onMove(pot, true) }, modifier = Modifier.size(24.dp)) {
                        Icon(Icons.Default.ArrowUpward, contentDescription = "", tint = ColorTextMuted, modifier = Modifier.size(16.dp))
                    }
                    IconButton(onClick = { onMove(pot, false) }, modifier = Modifier.size(24.dp)) {
                        Icon(Icons.Default.ArrowDownward, contentDescription = "", tint = ColorTextMuted, modifier = Modifier.size(16.dp))
                    }
                    IconButton(onClick = { onDelete(pot) }, modifier = Modifier.size(24.dp)) {
                        Icon(Icons.Default.Close, contentDescription = "", tint = Color.Red.copy(alpha = 0.7f), modifier = Modifier.size(16.dp))
                    }
                }
            }
            Spacer(modifier = Modifier.height(4.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Кол-во: ".loc(), color = ColorTextMuted, fontSize = 13.sp, modifier = Modifier.padding(end = 8.dp))
                    Box(
                        modifier = Modifier
                            .size(28.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .background(ColorBgDark)
                            .clickable { onQtyChange(pot, -1) },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.Remove, contentDescription = "Decrease Quantity", tint = Color.White, modifier = Modifier.size(14.dp))
                    }
                    Text(
                        pot.quantity.toString(),
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 10.dp),
                        fontSize = 14.sp
                    )
                    Box(
                        modifier = Modifier
                            .size(28.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .background(ColorPurpleAccent)
                            .clickable { onQtyChange(pot, 1) },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.Add, contentDescription = "Increase Quantity", tint = Color.White, modifier = Modifier.size(14.dp))
                    }
                }
            }
            if (!isCollapsed) {
                Spacer(modifier = Modifier.height(4.dp))
                OutlinedTextField(
                    value = descText,
                    onValueChange = {
                        descText = it
                        onEdit(pot.copy(description = it))
                    },
                    colors = getTextFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp)
                )
            }
        }
    }
}

@Composable
fun TabPotionsContent(
    list: List<Potion>,
    collapsedItemIds: Set<String>,
    onToggleCollapse: (String) -> Unit,
    onCollapseAll: (List<String>) -> Unit,
    onExpandAll: (List<String>) -> Unit,
    onAdd: (String, Int, String) -> Unit,
    onQtyChange: (Potion, Int) -> Unit,
    onDelete: (Potion) -> Unit,
    onMove: (Potion, Boolean) -> Unit,
    onEdit: (Potion) -> Unit
) {
    var addName by remember { mutableStateOf("") }
    var addQty by remember { mutableStateOf("1") }
    var addDesc by remember { mutableStateOf("") }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("🧪 " + "Зелья".loc(), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("${list.sumOf { it.quantity }}${" шт".loc()}", color = ColorTextMuted, fontSize = 12.sp)
                Spacer(modifier = Modifier.width(4.dp))
                TextButton(onClick = { onCollapseAll(list.map { "pot_${it.id}" }) }) {
                    Text("Свернуть все".loc(), color = ColorPurpleAccent, fontSize = 11.sp)
                }
                TextButton(onClick = { onExpandAll(list.map { "pot_${it.id}" }) }) {
                    Text("Развернуть все".loc(), color = ColorPurpleAccent, fontSize = 11.sp)
                }
            }
        }

        list.forEach { pot ->
            androidx.compose.runtime.key(pot.id) {
                PotionItemCard(
                    pot = pot,
                    isCollapsed = collapsedItemIds.contains("pot_${pot.id}"),
                    onToggleCollapse = { onToggleCollapse("pot_${pot.id}") },
                    onQtyChange = onQtyChange,
                    onDelete = onDelete,
                    onMove = onMove,
                    onEdit = onEdit
                )
            }
        }

        Card(colors = CardDefaults.cardColors(containerColor = ColorSurfaceDark)) {
            Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Добавить зелье".loc(), color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                OutlinedTextField(
                    value = addName,
                    onValueChange = { addName = it },
                    placeholder = { Text("Зелье лечения...".loc(), color = ColorTextMuted) },
                    colors = getTextFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                    singleLine = true
                )
                OutlinedTextField(
                    value = addQty,
                    onValueChange = { addQty = it },
                    label = { Text("Количество".loc(), color = ColorTextMuted) },
                    colors = getTextFieldColors(),
                    shape = RoundedCornerShape(8.dp),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                OutlinedTextField(
                    value = addDesc,
                    onValueChange = { addDesc = it },
                    placeholder = { Text("Описание / эффект (2d4+2 HP, длительность...)".loc(), color = ColorTextMuted) },
                    colors = getTextFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp)
                )

                Button(
                    onClick = {
                        if (addName.isNotBlank()) {
                            onAdd(addName, addQty.toIntOrNull() ?: 1, addDesc)
                            addName = ""
                            addQty = "1"
                            addDesc = ""
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = ColorPurpleAccent),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("+ Добавить зелье".loc())
                }
            }
        }
    }
}

@Composable
fun ConsumableItemCard(
    con: Consumable,
    isCollapsed: Boolean,
    onToggleCollapse: () -> Unit,
    onQtyChange: (Consumable, Int) -> Unit,
    onDelete: (Consumable) -> Unit,
    onMove: (Consumable, Boolean) -> Unit,
    onEdit: (Consumable) -> Unit
) {
    var nameText by remember(con.id) { mutableStateOf(con.name) }
    var descText by remember(con.id) { mutableStateOf(con.description) }

    LaunchedEffect(con.name) {
        if (nameText != con.name) {
            nameText = con.name
        }
    }
    LaunchedEffect(con.description) {
        if (descText != con.description) {
            descText = con.description
        }
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = ColorSurfaceDark),
        border = BorderStroke(1.dp, ColorBorderDark)
    ) {
        Column(modifier = Modifier.padding(10.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = nameText,
                    onValueChange = {
                        nameText = it
                        onEdit(con.copy(name = it))
                    },
                    colors = getTextFieldColors(),
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(8.dp),
                    singleLine = true
                )
                Spacer(modifier = Modifier.width(4.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = onToggleCollapse, modifier = Modifier.size(24.dp)) {
                        Icon(if (!isCollapsed) Icons.Default.ArrowDropUp else Icons.Default.ArrowDropDown, contentDescription = "", tint = Color.White, modifier = Modifier.size(20.dp))
                    }
                    IconButton(onClick = { onMove(con, true) }, modifier = Modifier.size(24.dp)) {
                        Icon(Icons.Default.ArrowUpward, contentDescription = "", tint = ColorTextMuted, modifier = Modifier.size(16.dp))
                    }
                    IconButton(onClick = { onMove(con, false) }, modifier = Modifier.size(24.dp)) {
                        Icon(Icons.Default.ArrowDownward, contentDescription = "", tint = ColorTextMuted, modifier = Modifier.size(16.dp))
                    }
                    IconButton(onClick = { onDelete(con) }, modifier = Modifier.size(24.dp)) {
                        Icon(Icons.Default.Close, contentDescription = "", tint = Color.Red.copy(alpha = 0.7f), modifier = Modifier.size(16.dp))
                    }
                }
            }
            Spacer(modifier = Modifier.height(4.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Кол-во: ".loc(), color = ColorTextMuted, fontSize = 13.sp, modifier = Modifier.padding(end = 8.dp))
                    Box(
                        modifier = Modifier
                            .size(28.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .background(ColorBgDark)
                            .clickable { onQtyChange(con, -1) },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.Remove, contentDescription = "Decrease Quantity", tint = Color.White, modifier = Modifier.size(14.dp))
                    }
                    Text(
                        con.quantity.toString(),
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 10.dp),
                        fontSize = 14.sp
                    )
                    Box(
                        modifier = Modifier
                            .size(28.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .background(ColorPurpleAccent)
                            .clickable { onQtyChange(con, 1) },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.Add, contentDescription = "Increase Quantity", tint = Color.White, modifier = Modifier.size(14.dp))
                    }
                }
            }
            if (!isCollapsed) {
                Spacer(modifier = Modifier.height(4.dp))
                OutlinedTextField(
                    value = descText,
                    onValueChange = {
                        descText = it
                        onEdit(con.copy(description = it))
                    },
                    colors = getTextFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp)
                )
            }
        }
    }
}

@Composable
fun TabConsumablesContent(
    list: List<Consumable>,
    collapsedItemIds: Set<String>,
    onToggleCollapse: (String) -> Unit,
    onCollapseAll: (List<String>) -> Unit,
    onExpandAll: (List<String>) -> Unit,
    onAdd: (String, Int, String) -> Unit,
    onQtyChange: (Consumable, Int) -> Unit,
    onDelete: (Consumable) -> Unit,
    onMove: (Consumable, Boolean) -> Unit,
    onEdit: (Consumable) -> Unit
) {
    var addName by remember { mutableStateOf("") }
    var addQty by remember { mutableStateOf("1") }
    var addDesc by remember { mutableStateOf("") }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("📦 " + "Расходники".loc(), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("${list.sumOf { it.quantity }}${" шт".loc()}", color = ColorTextMuted, fontSize = 12.sp)
                Spacer(modifier = Modifier.width(4.dp))
                TextButton(onClick = { onCollapseAll(list.map { "cons_${it.id}" }) }) {
                    Text("Свернуть все".loc(), color = ColorPurpleAccent, fontSize = 11.sp)
                }
                TextButton(onClick = { onExpandAll(list.map { "cons_${it.id}" }) }) {
                    Text("Развернуть все".loc(), color = ColorPurpleAccent, fontSize = 11.sp)
                }
            }
        }

        list.forEach { pot ->
            androidx.compose.runtime.key(pot.id) {
                ConsumableItemCard(
                    con = pot,
                    isCollapsed = collapsedItemIds.contains("cons_${pot.id}"),
                    onToggleCollapse = { onToggleCollapse("cons_${pot.id}") },
                    onQtyChange = onQtyChange,
                    onDelete = onDelete,
                    onMove = onMove,
                    onEdit = onEdit
                )
            }
        }

        Card(colors = CardDefaults.cardColors(containerColor = ColorSurfaceDark)) {
            Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Добавить расходник".loc(), color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                OutlinedTextField(
                    value = addName,
                    onValueChange = { addName = it },
                    placeholder = { Text("Стрелы, свитки...".loc(), color = ColorTextMuted) },
                    colors = getTextFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                    singleLine = true
                )
                OutlinedTextField(
                    value = addQty,
                    onValueChange = { addQty = it },
                    label = { Text("Количество".loc(), color = ColorTextMuted) },
                    colors = getTextFieldColors(),
                    shape = RoundedCornerShape(8.dp),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                OutlinedTextField(
                    value = addDesc,
                    onValueChange = { addDesc = it },
                    placeholder = { Text("Описание, эффект, особенности...".loc(), color = ColorTextMuted) },
                    colors = getTextFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp)
                )

                Button(
                    onClick = {
                        if (addName.isNotBlank()) {
                            onAdd(addName, addQty.toIntOrNull() ?: 1, addDesc)
                            addName = ""
                            addQty = "1"
                            addDesc = ""
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = ColorPurpleAccent),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("+ Добавить расходник".loc())
                }
            }
        }
    }
}

@Composable
fun DiceBlock(
    value: String,
    label: String = "",
    isSelected: Boolean = true,
    isDiscarded: Boolean = false
) {
    Box(
        modifier = Modifier
            .size(105.dp)
            .graphicsLayer {
                shadowElevation = 8f
                shape = RoundedCornerShape(16.dp)
                clip = true
            }
            .background(Color(0xFF121215))
            .border(
                BorderStroke(
                    width = if (isSelected) 2.dp else 1.dp,
                    color = if (isSelected) ColorPurpleAccent else Color.White.copy(alpha = 0.12f)
                ),
                RoundedCornerShape(16.dp)
            ),
        contentAlignment = Alignment.Center
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val cx = size.width / 2f
            val cy = size.height / 2f
            val r = size.minDimension / 2.3f
            
            val ptsX = FloatArray(6)
            val ptsY = FloatArray(6)
            for (j in 0 until 6) {
                val angle = (j * 60 - 30) * Math.PI / 180.0
                ptsX[j] = cx + r * Math.cos(angle).toFloat()
                ptsY[j] = cy + r * Math.sin(angle).toFloat()
            }
            
            val path = androidx.compose.ui.graphics.Path().apply {
                moveTo(ptsX[0], ptsY[0])
                for (j in 1 until 6) {
                    lineTo(ptsX[j], ptsY[j])
                }
                close()
            }
            
            // Outer d20 hexagon outline
            drawPath(
                path = path,
                color = (if (isSelected) ColorPurpleAccent else Color.White).copy(alpha = 0.12f),
                style = androidx.compose.ui.graphics.drawscope.Stroke(width = 1.5f.dp.toPx())
            )
            
            // facet lines mapping
            for (j in listOf(0, 2, 4)) {
                drawLine(
                    color = (if (isSelected) ColorPurpleAccent else Color.White).copy(alpha = 0.08f),
                    start = androidx.compose.ui.geometry.Offset(cx, cy),
                    end = androidx.compose.ui.geometry.Offset(ptsX[j], ptsY[j]),
                    strokeWidth = 1f.dp.toPx()
                )
            }
            drawLine(
                color = (if (isSelected) ColorPurpleAccent else Color.White).copy(alpha = 0.05f),
                start = androidx.compose.ui.geometry.Offset(ptsX[1], ptsY[1]),
                end = androidx.compose.ui.geometry.Offset(ptsX[3], ptsY[3]),
                strokeWidth = 1f.dp.toPx()
            )
            drawLine(
                color = (if (isSelected) ColorPurpleAccent else Color.White).copy(alpha = 0.05f),
                start = androidx.compose.ui.geometry.Offset(ptsX[3], ptsY[3]),
                end = androidx.compose.ui.geometry.Offset(ptsX[5], ptsY[5]),
                strokeWidth = 1f.dp.toPx()
            )
            drawLine(
                color = (if (isSelected) ColorPurpleAccent else Color.White).copy(alpha = 0.05f),
                start = androidx.compose.ui.geometry.Offset(ptsX[5], ptsY[5]),
                end = androidx.compose.ui.geometry.Offset(ptsX[1], ptsY[1]),
                strokeWidth = 1f.dp.toPx()
            )
        }

        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier.padding(4.dp)
        ) {
            Text(
                text = value,
                color = if (isSelected) Color.White else Color.White.copy(alpha = 0.35f),
                fontSize = 32.sp,
                fontWeight = FontWeight.Bold,
                style = LocalTextStyle.current.copy(
                    textDecoration = if (isDiscarded) TextDecoration.LineThrough else TextDecoration.None
                )
            )
            if (label.isNotEmpty()) {
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = label,
                    color = if (isSelected) ColorPurpleAccent else ColorTextMuted,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                    modifier = Modifier.padding(horizontal = 4.dp)
                )
            }
        }
    }
}

@Composable
fun TabDiceContent(
    notation1: String,
    notation2: String,
    activeMode: String,
    activeTarget: Int,
    lastRolledValue: Int,
    lastRolledNotation: String,
    lastRollFirstVal: Int?,
    lastRollSecondVal: Int?,
    lastRollType: String,
    lastRollChoice: Int,
    lastRollFirstDetail: String,
    lastRollSecondDetail: String,
    lastRollFirstNotation: String,
    lastRollSecondNotation: String,
    logs: List<DiceRollLog>,
    onNotation1Change: (String) -> Unit,
    onNotation2Change: (String) -> Unit,
    onModeChange: (String) -> Unit,
    onTargetChange: (Int) -> Unit,
    onTriggerRoll: () -> Unit,
    onRollNotation: (String) -> Unit,
    onClearLogs: () -> Unit
) {
    val quickDice = listOf("d4", "d6", "d8", "d10", "d12", "d20", "d100", "Своё")
    var showCustomNotationByDialog by remember { mutableStateOf(false) }
    var customTextForDialog by remember { mutableStateOf("2d10+4") }

    // Click track for notation target selection
    var activeNotationTarget by remember { mutableStateOf(1) } // 1 for Notation 1, 2 for Notation 2

    // Animation States
    var isCurrentlyAnimating by remember { mutableStateOf(false) }
    var animatedValueCombined by remember { mutableStateOf(lastRolledValue) }
    var animatedValueFirst by remember { mutableStateOf<Int?>(null) }
    var animatedValueSecond by remember { mutableStateOf<Int?>(null) }

    LaunchedEffect(lastRolledValue, lastRollFirstVal, lastRollSecondVal) {
        if (lastRolledValue > 0) {
            isCurrentlyAnimating = true
            
            // Beautiful progressive quadratic deceleration animation for exactly 2 seconds (total steps = 25)
            val totalSteps = 25
            for (step in 0 until totalSteps) {
                // Generate random temporary values representing polyhedral spin
                animatedValueCombined = kotlin.random.Random.nextInt(1, 21)
                animatedValueFirst = if (lastRollFirstVal != null) kotlin.random.Random.nextInt(1, 21) else null
                animatedValueSecond = if (lastRollSecondVal != null) kotlin.random.Random.nextInt(1, 21) else null
                
                // Starts fast (40ms), slows down via standard deceleration mapping to 180ms
                val fraction = step.toFloat() / totalSteps
                val delayMs = (40f + (140f * fraction * fraction)).toLong()
                
                kotlinx.coroutines.delay(delayMs)
            }
            
            animatedValueCombined = lastRolledValue
            animatedValueFirst = lastRollFirstVal
            animatedValueSecond = lastRollSecondVal
            isCurrentlyAnimating = false
        } else {
            animatedValueCombined = lastRolledValue
            animatedValueFirst = lastRollFirstVal
            animatedValueSecond = lastRollSecondVal
        }
    }

    // Shake offset Modifier during active roll
    val shakingModifier = if (isCurrentlyAnimating) {
        Modifier.offset(
            x = kotlin.random.Random.nextInt(-5, 6).dp,
            y = kotlin.random.Random.nextInt(-5, 6).dp
        )
    } else {
        Modifier
    }

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        
        // Rolling Tray UI Card
        Card(
            colors = CardDefaults.cardColors(containerColor = Color(0xFF151419)),
            shape = RoundedCornerShape(16.dp),
            border = BorderStroke(1.dp, ColorPurpleAccent.copy(alpha = 0.2f)),
            modifier = Modifier
                .fillMaxWidth()
                .then(shakingModifier)
                .clickable { onTriggerRoll() }
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                if (lastRolledValue == 0) {
                    // Initial hollow/waiting state representation
                    DiceBlock(
                        value = "?",
                        label = "Бросьте кубы".loc(),
                        isSelected = false
                    )
                } else if (lastRollType == "both") {
                    // Both dice rolls layout
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        DiceBlock(
                            value = (animatedValueFirst ?: animatedValueCombined).toString(),
                            label = lastRollFirstNotation,
                            isSelected = true
                        )

                        Text(
                            text = "+", 
                            color = ColorPurpleAccent, 
                            fontSize = 28.sp, 
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 16.dp)
                        )

                        DiceBlock(
                            value = (animatedValueSecond ?: animatedValueCombined).toString(),
                            label = lastRollSecondNotation,
                            isSelected = true
                        )
                    }
                    
                    if (!isCurrentlyAnimating) {
                        Spacer(modifier = Modifier.height(14.dp))
                        HorizontalDivider(color = Color.White.copy(alpha = 0.12f), modifier = Modifier.padding(horizontal = 12.dp))
                        Spacer(modifier = Modifier.height(8.dp))
                        
                        Text(
                            text = "${"Сумма: ".loc()}$animatedValueCombined",
                            color = Color.White,
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                } else if (lastRollType == "adv" || lastRollType == "dis") {
                    // Advantage/Disadvantage Layout
                    val labelMode = if (lastRollType == "adv") "Преимущ.".loc() else "Помеха".loc()
                    Box(
                        modifier = Modifier
                            .background(Color.White.copy(alpha = 0.12f), RoundedCornerShape(10.dp))
                            .padding(horizontal = 14.dp, vertical = 4.dp)
                    ) {
                        Text("$lastRolledNotation · $labelMode", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                    }
                    Spacer(modifier = Modifier.height(14.dp))
                    
                    val isFirstChosen = lastRollChoice == 1
                    val isSecondChosen = lastRollChoice == 2
                    
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        DiceBlock(
                            value = (animatedValueFirst ?: 0).toString(),
                            label = if (isFirstChosen) "Выбран".loc() else "Отброшен".loc(),
                            isSelected = isFirstChosen,
                            isDiscarded = isSecondChosen
                        )

                        Text(
                            text = "vs", 
                            color = Color.White.copy(alpha = 0.4f), 
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 16.dp)
                        )

                        DiceBlock(
                            value = (animatedValueSecond ?: 0).toString(),
                            label = if (isSecondChosen) "Выбран".loc() else "Отброшен".loc(),
                            isSelected = isSecondChosen,
                            isDiscarded = isFirstChosen
                        )
                    }
                    
                    if (!isCurrentlyAnimating) {
                        Spacer(modifier = Modifier.height(14.dp))
                        HorizontalDivider(color = Color.White.copy(alpha = 0.12f), modifier = Modifier.padding(horizontal = 12.dp))
                        Spacer(modifier = Modifier.height(8.dp))
                        
                        Text(
                            text = "Результат: $animatedValueCombined".loc(),
                            color = Color.White,
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                } else {
                    // Standard single dice roll representation
                    DiceBlock(
                        value = animatedValueCombined.toString(),
                        label = lastRolledNotation,
                        isSelected = true
                    )
                    
                    if (!isCurrentlyAnimating && lastRollFirstDetail.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(10.dp))
                        Text(
                            text = "[$lastRollFirstDetail]",
                            color = ColorPurpleAccent,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }
        }

        // Clickable Button Slots instead of InputTextFields (solves Keyboard Popup seamlessly!)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
            val isNot1Selected = activeNotationTarget == 1
            val isNot2Selected = activeNotationTarget == 2
            
            // Notation Slot 1
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(8.dp))
                    .background(ColorSurfaceDark)
                    .border(
                        BorderStroke(
                            if (isNot1Selected) 2.dp else 1.dp,
                            if (isNot1Selected) ColorPurpleAccent else Color.White.copy(alpha = 0.12f)
                        ),
                        RoundedCornerShape(8.dp)
                    )
                    .clickable { activeNotationTarget = 1 }
                    .padding(horizontal = 12.dp, vertical = 10.dp)
            ) {
                Column {
                    Text(
                        text = if (isNot1Selected) "👉 Нотация 1".loc() else "Нотация 1".loc(),
                        color = if (isNot1Selected) ColorPurpleAccent else ColorTextMuted,
                        fontSize = 11.sp,
                        fontWeight = if (isNot1Selected) FontWeight.Bold else FontWeight.Normal
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = notation1.ifEmpty { "1d20" },
                        color = Color.White,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
            
            // Notation Slot 2
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(8.dp))
                    .background(ColorSurfaceDark)
                    .border(
                        BorderStroke(
                            if (isNot2Selected) 2.dp else 1.dp,
                            if (isNot2Selected) ColorPurpleAccent else Color.White.copy(alpha = 0.12f)
                        ),
                        RoundedCornerShape(8.dp)
                    )
                    .clickable { activeNotationTarget = 2 }
                    .padding(horizontal = 12.dp, vertical = 10.dp)
            ) {
                Column {
                    Text(
                        text = if (isNot2Selected) "👉 Нотация 2".loc() else "Нотация 2".loc(),
                        color = if (isNot2Selected) ColorPurpleAccent else ColorTextMuted,
                        fontSize = 11.sp,
                        fontWeight = if (isNot2Selected) FontWeight.Bold else FontWeight.Normal
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = notation2.ifEmpty { "1d8" },
                        color = Color.White,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }

        // Modes Row Selection
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.fillMaxWidth()) {
            listOf("Обычный", "Преим.", "Помеха").forEach { md ->
                val active = activeMode == md
                val bg = if (active) ColorPurpleAccent else ColorSurfaceDark
                val fg = if (active) Color.White else ColorTextMuted
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(8.dp))
                        .background(bg)
                        .clickable { onModeChange(md) }
                        .padding(vertical = 10.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(md.loc(), color = fg, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
            }
        }

        // Quick Selection Buttons (populates active slot instantly!)
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.fillMaxWidth()) {
                quickDice.take(4).forEach { d ->
                    Button(
                        onClick = {
                            if (d == "Своё") {
                                showCustomNotationByDialog = true
                            } else {
                                if (activeNotationTarget == 1) onNotation1Change("1$d") else onNotation2Change("1$d")
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = ColorSurfaceDark),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.weight(1f),
                        contentPadding = PaddingValues(0.dp)
                    ) { Text(d.loc(), color = Color.White, fontSize = 13.sp) }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.fillMaxWidth()) {
                quickDice.drop(4).forEach { d ->
                    Button(
                        onClick = {
                            if (d == "Своё") {
                                showCustomNotationByDialog = true
                            } else {
                                if (activeNotationTarget == 1) onNotation1Change("1$d") else onNotation2Change("1$d")
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = ColorSurfaceDark),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.weight(1f),
                        contentPadding = PaddingValues(0.dp)
                    ) { Text(d.loc(), color = Color.White, fontSize = 13.sp) }
                }
            }
        }

        // Target state selectors (Select what to roll, highlights appropriately!)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
            val target1Act = activeTarget == 1
            Button(
                onClick = { onTargetChange(1) },
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (target1Act) ColorPurpleAccent else ColorSurfaceDark,
                    contentColor = if (target1Act) Color.White else ColorTextMuted
                ),
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.weight(1.2f)
            ) { Text("Бросить 1-й".loc(), fontSize = 13.sp) }
            
            val target2Act = activeTarget == 2
            Button(
                onClick = { onTargetChange(2) },
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (target2Act) ColorPurpleAccent else ColorSurfaceDark,
                    contentColor = if (target2Act) Color.White else ColorTextMuted
                ),
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.weight(1.2f)
            ) { Text("Бросить 2-й".loc(), fontSize = 13.sp) }

            val target3Act = activeTarget == 3
            Button(
                onClick = { onTargetChange(3) },
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (target3Act) ColorPurpleAccent else ColorSurfaceDark,
                    contentColor = if (target3Act) Color.White else ColorTextMuted
                ),
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.weight(1f)
            ) { Text("Оба".loc(), fontSize = 13.sp) }
        }

        // Big Prominent Roll Action Button
        Button(
            onClick = { onTriggerRoll() },
            colors = ButtonDefaults.buttonColors(containerColor = ColorPurpleAccent),
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
        ) {
            Text("🎲 " + "Бросить".loc(), color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold)
        }

        // History list logs
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("История бросков".loc(), color = Color.White, fontWeight = FontWeight.Bold)
            TextButton(onClick = onClearLogs) {
                Text("Очистить".loc(), color = Color.Red.copy(alpha = 0.8f))
            }
        }

        Card(colors = CardDefaults.cardColors(containerColor = ColorSurfaceDark)) {
            Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                if (logs.isEmpty()) {
                    Text("История пуста".loc(), color = ColorTextMuted, fontSize = 13.sp, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
                } else {
                    logs.forEach { item ->
                        Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                            Text(item.notation, color = ColorTextMuted, fontSize = 13.sp)
                            Text(item.resultsText, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        }
                        HorizontalDivider(color = ColorBorderDark)
                    }
                }
            }
        }
    }

    if (showCustomNotationByDialog) {
        AlertDialog(
            onDismissRequest = { showCustomNotationByDialog = false },
            title = { Text("Свой куб / формула".loc(), color = Color.White) },
            text = {
                OutlinedTextField(
                    value = customTextForDialog,
                    onValueChange = { customTextForDialog = it },
                    placeholder = { Text("например, 3d8+6".loc(), color = ColorTextMuted) },
                    colors = getTextFieldColors()
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (activeNotationTarget == 1) onNotation1Change(customTextForDialog) else onNotation2Change(customTextForDialog)
                        showCustomNotationByDialog = false
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = ColorPurpleAccent)
                ) { Text("Применить".loc()) }
            },
            dismissButton = {
                TextButton(onClick = { showCustomNotationByDialog = false }) { Text("Отмена".loc(), color = ColorTextMuted) }
            },
            containerColor = ColorSurfaceDark
        )
    }
}

@Composable
fun TabNotesContent(
    text: String,
    onSave: (String) -> Unit
) {
    var notesText by remember { mutableStateOf(text) }

    LaunchedEffect(text) {
        if (notesText != text) {
            notesText = text
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Заметки кампании".loc(), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
        OutlinedTextField(
            value = notesText,
            onValueChange = {
                notesText = it
                onSave(it)
            },
            placeholder = { Text("Записывай всё важное...".loc(), color = ColorTextMuted) },
            colors = getTextFieldColors(),
            modifier = Modifier
                .fillMaxWidth()
                .height(350.dp),
            shape = RoundedCornerShape(12.dp)
        )
    }
}

@Composable
fun TabStatsContent(
    profile: Profile,
    onUpdate: (
        ac: Int, spy: Int, ini: Int, hpC: Int, hpM: Int,
        str: Int, dex: Int, con: Int, int: Int, wis: Int, cha: Int
    ) -> Unit
) {
    val stats = listOf(
        "Сила" to profile.strength,
        "Ловк." to profile.dexterity,
        "Выно." to profile.constitution,
        "Инт." to profile.intelligence,
        "Муд." to profile.wisdom,
        "Хар." to profile.charisma
    )

    var acText by remember(profile.id) { mutableStateOf(profile.armorClass.toString()) }
    var speedText by remember(profile.id) { mutableStateOf(profile.speed.toString()) }
    var initText by remember(profile.id) { mutableStateOf(profile.initiative.toString()) }

    LaunchedEffect(profile.armorClass) {
        if (acText != profile.armorClass.toString()) {
            acText = profile.armorClass.toString()
        }
    }
    LaunchedEffect(profile.speed) {
        if (speedText != profile.speed.toString()) {
            speedText = profile.speed.toString()
        }
    }
    LaunchedEffect(profile.initiative) {
        if (initText != profile.initiative.toString()) {
            initText = profile.initiative.toString()
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("HP и характеристики".loc(), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)

        // AC, Speed, Initiative row
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            OutlinedTextField(
                value = acText,
                onValueChange = { newValue ->
                    val cleaned = newValue.filter { it.isDigit() || it == '-' }
                    acText = cleaned
                    val parsed = cleaned.toIntOrNull()
                    if (parsed != null) {
                        onUpdate(parsed, profile.speed, profile.initiative, profile.hpCurrent, profile.hpMax, profile.strength, profile.dexterity, profile.constitution, profile.intelligence, profile.wisdom, profile.charisma)
                    }
                },
                label = { Text("КД".loc(), color = ColorTextMuted) },
                colors = getTextFieldColors(),
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(8.dp),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true
            )
            OutlinedTextField(
                value = speedText,
                onValueChange = { newValue ->
                    val cleaned = newValue.filter { it.isDigit() || it == '-' }
                    speedText = cleaned
                    val parsed = cleaned.toIntOrNull()
                    if (parsed != null) {
                        onUpdate(profile.armorClass, parsed, profile.initiative, profile.hpCurrent, profile.hpMax, profile.strength, profile.dexterity, profile.constitution, profile.intelligence, profile.wisdom, profile.charisma)
                    }
                },
                label = { Text("Скорость".loc(), color = ColorTextMuted) },
                colors = getTextFieldColors(),
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(8.dp),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true
            )
            OutlinedTextField(
                value = initText,
                onValueChange = { newValue ->
                    val cleaned = newValue.filter { it.isDigit() || it == '-' }
                    initText = cleaned
                    val parsed = cleaned.toIntOrNull()
                    if (parsed != null) {
                        onUpdate(profile.armorClass, profile.speed, parsed, profile.hpCurrent, profile.hpMax, profile.strength, profile.dexterity, profile.constitution, profile.intelligence, profile.wisdom, profile.charisma)
                    }
                },
                label = { Text("Инициатива".loc(), color = ColorTextMuted) },
                colors = getTextFieldColors(),
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(8.dp),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true
            )
        }

        // HP Box with health steppers
        Card(colors = CardDefaults.cardColors(containerColor = ColorSurfaceDark)) {
            Column(modifier = Modifier.padding(12.dp)) {
                Text("HP (Очки здоровья)".loc(), color = ColorTextMuted, fontSize = 12.sp)
                Spacer(modifier = Modifier.height(4.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Button(
                            onClick = { onUpdate(profile.armorClass, profile.speed, profile.initiative, maxOf(0, profile.hpCurrent - 5), profile.hpMax, profile.strength, profile.dexterity, profile.constitution, profile.intelligence, profile.wisdom, profile.charisma) },
                            colors = ButtonDefaults.buttonColors(containerColor = ColorBgDark),
                            contentPadding = PaddingValues(0.dp),
                            modifier = Modifier.size(36.dp)
                        ) { Text("-5", fontSize = 12.sp, color = Color.White) }
                        
                        Button(
                            onClick = { onUpdate(profile.armorClass, profile.speed, profile.initiative, maxOf(0, profile.hpCurrent - 1), profile.hpMax, profile.strength, profile.dexterity, profile.constitution, profile.intelligence, profile.wisdom, profile.charisma) },
                            colors = ButtonDefaults.buttonColors(containerColor = ColorBgDark),
                            contentPadding = PaddingValues(0.dp),
                            modifier = Modifier.size(36.dp)
                        ) { Text("-1", fontSize = 12.sp, color = Color.White) }
                    }

                    Text(
                        "${profile.hpCurrent}/${profile.hpMax}",
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 20.sp
                    )

                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Button(
                            onClick = { onUpdate(profile.armorClass, profile.speed, profile.initiative, minOf(profile.hpMax, profile.hpCurrent + 1), profile.hpMax, profile.strength, profile.dexterity, profile.constitution, profile.intelligence, profile.wisdom, profile.charisma) },
                            colors = ButtonDefaults.buttonColors(containerColor = ColorPurpleAccent),
                            contentPadding = PaddingValues(0.dp),
                            modifier = Modifier.size(36.dp)
                        ) { Text("+1", fontSize = 12.sp, color = Color.White) }

                        Button(
                            onClick = { onUpdate(profile.armorClass, profile.speed, profile.initiative, minOf(profile.hpMax, profile.hpCurrent + 5), profile.hpMax, profile.strength, profile.dexterity, profile.constitution, profile.intelligence, profile.wisdom, profile.charisma) },
                            colors = ButtonDefaults.buttonColors(containerColor = ColorPurpleAccent),
                            contentPadding = PaddingValues(0.dp),
                            modifier = Modifier.size(36.dp)
                        ) { Text("+5", fontSize = 12.sp, color = Color.White) }
                    }
                }
                Spacer(modifier = Modifier.height(4.dp))
                // Progress Bar
                val progress = if (profile.hpMax > 0) (profile.hpCurrent.toFloat() / profile.hpMax.toFloat()).coerceIn(0f, 1f) else 0f
                LinearProgressIndicator(
                    progress = { progress },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(8.dp)
                        .clip(RoundedCornerShape(4.dp)),
                    color = Color(0xFF4CAF50),
                    trackColor = ColorBgDark
                )
                Spacer(modifier = Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                    var showSetHpDialog by remember { mutableStateOf(false) }
                    var tempMaxHpInput by remember { mutableStateOf(profile.hpMax.toString()) }
                    
                    Button(
                        onClick = { showSetHpDialog = true },
                        colors = ButtonDefaults.buttonColors(containerColor = ColorBgDark),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.weight(1f)
                    ) { Text("Уст.".loc(), fontSize = 12.sp) }
                    
                    Button(
                        onClick = { onUpdate(profile.armorClass, profile.speed, profile.initiative, profile.hpCurrent, profile.hpCurrent, profile.strength, profile.dexterity, profile.constitution, profile.intelligence, profile.wisdom, profile.charisma) },
                        colors = ButtonDefaults.buttonColors(containerColor = ColorBgDark),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.weight(1f)
                    ) { Text("Макс".loc(), fontSize = 12.sp) }
                    
                    Button(
                        onClick = { onUpdate(profile.armorClass, profile.speed, profile.initiative, profile.hpMax, profile.hpMax, profile.strength, profile.dexterity, profile.constitution, profile.intelligence, profile.wisdom, profile.charisma) },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF4CAF50).copy(alpha = 0.2f)),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.weight(1.2f)
                    ) { Text("Полное".loc(), fontSize = 12.sp, color = Color(0xFF4CAF50)) }

                    if (showSetHpDialog) {
                        AlertDialog(
                            onDismissRequest = { showSetHpDialog = false },
                            title = { Text("Установить Макс HP".loc(), color = Color.White) },
                            text = {
                                OutlinedTextField(
                                    value = tempMaxHpInput,
                                    onValueChange = { tempMaxHpInput = it },
                                    label = { Text("Макс ОЗ".loc(), color = ColorTextMuted) },
                                    colors = getTextFieldColors(),
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                                )
                            },
                            confirmButton = {
                                Button(
                                    onClick = {
                                        val m = tempMaxHpInput.toIntOrNull() ?: profile.hpMax
                                        onUpdate(profile.armorClass, profile.speed, profile.initiative, minOf(m, profile.hpCurrent), m, profile.strength, profile.dexterity, profile.constitution, profile.intelligence, profile.wisdom, profile.charisma)
                                        showSetHpDialog = false
                                    },
                                    colors = ButtonDefaults.buttonColors(containerColor = ColorPurpleAccent)
                                ) { Text("Установить".loc()) }
                            },
                            dismissButton = {
                                TextButton(onClick = { showSetHpDialog = false }) { Text("Отмена".loc(), color = ColorTextMuted) }
                            },
                            containerColor = ColorSurfaceDark
                        )
                    }
                }
            }
        }

        // Characteristics Grid (Strength, Dex, Con, Int, Wis, Cha)
        Text("Характеристики".loc(), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
        
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            // First Row
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                stats.take(3).forEach { (name, value) ->
                    Box(modifier = Modifier.weight(1f)) {
                        CardStatElement(
                            name = name,
                            value = value,
                            onValChange = { newVal ->
                                val targetStr = if (name == "Сила") newVal else profile.strength
                                val targetDex = if (name == "Ловк.") newVal else profile.dexterity
                                val targetCon = if (name == "Выно.") newVal else profile.constitution
                                onUpdate(profile.armorClass, profile.speed, profile.initiative, profile.hpCurrent, profile.hpMax, targetStr, targetDex, targetCon, profile.intelligence, profile.wisdom, profile.charisma)
                            }
                        )
                    }
                }
            }
            // Second Row
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                stats.drop(3).forEach { (name, value) ->
                    Box(modifier = Modifier.weight(1f)) {
                        CardStatElement(
                            name = name,
                            value = value,
                            onValChange = { newVal ->
                                val targetInt = if (name == "Инт.") newVal else profile.intelligence
                                val targetWis = if (name == "Муд.") newVal else profile.wisdom
                                val targetCha = if (name == "Хар.") newVal else profile.charisma
                                onUpdate(profile.armorClass, profile.speed, profile.initiative, profile.hpCurrent, profile.hpMax, profile.strength, profile.dexterity, profile.constitution, targetInt, targetWis, targetCha)
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun CardStatElement(
    name: String,
    value: Int,
    onValChange: (Int) -> Unit
) {
    // Calculater Dnd Modifiers (e.g., 10 is +0, 12 is +1, 8 is -1)
    val modifier = (value - 10) / 2
    val sign = if (modifier >= 0) "+$modifier" else "$modifier"
    var textValue by remember(name) { mutableStateOf(value.toString()) }

    LaunchedEffect(value) {
        if (textValue != value.toString()) {
            textValue = value.toString()
        }
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = ColorSurfaceDark),
        border = BorderStroke(1.dp, ColorBorderDark)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(8.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(name.loc(), color = ColorTextMuted, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
            Spacer(modifier = Modifier.height(2.dp))
            Text(sign, color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(2.dp))
            OutlinedTextField(
                value = textValue,
                onValueChange = { newValue ->
                    val cleaned = newValue.filter { it.isDigit() || it == '-' }
                    textValue = cleaned
                    val parsed = cleaned.toIntOrNull()
                    if (parsed != null) {
                        onValChange(parsed)
                    }
                },
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = Color.White,
                    unfocusedTextColor = ColorTextMuted,
                    focusedContainerColor = ColorBgDark,
                    unfocusedContainerColor = ColorBgDark,
                    focusedBorderColor = ColorPurpleAccent,
                    unfocusedBorderColor = ColorBorderDark,
                ),
                textStyle = LocalTextStyle.current.copy(textAlign = TextAlign.Center, fontSize = 12.sp),
                modifier = Modifier
                    .width(64.dp),
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
            )
        }
    }
}

@Composable
fun TabSettingsContent(
    profile: Profile,
    currentLanguage: String,
    onLanguageChange: (String) -> Unit,
    onUpdateSettings: (String, String, String) -> Unit,
    onExport: () -> Unit,
    onImportClick: () -> Unit,
    onReset: () -> Unit
) {
    var dmText by remember(profile.id) { mutableStateOf(profile.dmName) }
    var campaignCodeText by remember(profile.id) { mutableStateOf(profile.campaignCode) }
    var playerNickText by remember(profile.id) { mutableStateOf(profile.playerNick) }

    LaunchedEffect(profile.dmName) {
        if (dmText != profile.dmName) {
            dmText = profile.dmName
        }
    }
    LaunchedEffect(profile.campaignCode) {
        if (campaignCodeText != profile.campaignCode) {
            campaignCodeText = profile.campaignCode
        }
    }
    LaunchedEffect(profile.playerNick) {
        if (playerNickText != profile.playerNick) {
            playerNickText = profile.playerNick
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Настройки".loc(), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)

        OutlinedTextField(
            value = dmText,
            onValueChange = {
                dmText = it
                onUpdateSettings(it, campaignCodeText, playerNickText)
            },
            label = { Text("DM / Мастер".loc(), color = ColorTextMuted) },
            colors = getTextFieldColors(),
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(8.dp),
            singleLine = true
        )

        Card(colors = CardDefaults.cardColors(containerColor = ColorSurfaceDark)) {
            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Язык интерфейса".loc(), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    val languages = listOf("ru" to "Русский", "en" to "English")
                    languages.forEach { (code, name) ->
                        val isSelected = currentLanguage == code
                        val bg = if (isSelected) ColorPurpleAccent else ColorBgDark
                        val fg = if (isSelected) ColorBgDark else Color.White
                        Button(
                            onClick = { onLanguageChange(code) },
                            colors = ButtonDefaults.buttonColors(containerColor = bg),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Text(name, color = fg, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
        }

        Card(colors = CardDefaults.cardColors(containerColor = ColorSurfaceDark)) {
            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Экспорт / Импорт".loc(), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                Text(
                    text = "Данные хранятся локально на устройстве. Используйте эти инструменты для создания резервных копий.".loc(),
                    color = ColorTextMuted,
                    fontSize = 11.sp
                )
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                    Button(
                        onClick = onExport,
                        colors = ButtonDefaults.buttonColors(containerColor = ColorBgDark),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.weight(1f)
                    ) { Text("Экспорт JSON".loc(), fontSize = 12.sp) }

                    Button(
                        onClick = onImportClick,
                        colors = ButtonDefaults.buttonColors(containerColor = ColorBgDark),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.weight(1f)
                    ) { Text("Импорт JSON".loc(), fontSize = 12.sp) }
                }
            }
        }

        Button(
            onClick = onReset,
            colors = ButtonDefaults.buttonColors(containerColor = Color.Red.copy(alpha = 0.1f)),
            border = BorderStroke(1.dp, Color.Red.copy(alpha = 0.5f)),
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(8.dp)
        ) {
            Icon(Icons.Default.Warning, contentDescription = "", tint = Color.Red, modifier = Modifier.size(16.dp))
            Spacer(modifier = Modifier.width(6.dp))
            Text("Сбросить профиль".loc(), color = Color.Red, fontSize = 13.sp)
        }
    }
}
