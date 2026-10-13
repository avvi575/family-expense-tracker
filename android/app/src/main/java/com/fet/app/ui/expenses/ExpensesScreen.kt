package com.fet.app.ui.expenses

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.fet.app.data.ExpenseDto
import com.fet.app.ui.AppViewModel
import com.fet.app.ui.money

private val METHODS = listOf("CASH", "CARD", "UPI", "BANK_TRANSFER", "OTHER")

@Composable
fun ExpensesScreen(viewModel: AppViewModel, modifier: Modifier = Modifier) {
    var showAdd by remember { mutableStateOf(false) }
    var toDelete by remember { mutableStateOf<ExpenseDto?>(null) }

    Scaffold(
        modifier = modifier,
        floatingActionButton = {
            FloatingActionButton(onClick = { showAdd = true }) {
                Icon(Icons.Default.Add, contentDescription = "Add expense")
            }
        }
    ) { padding ->
        Column(Modifier.padding(padding).padding(horizontal = 16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(onClick = { viewModel.setMonth(shiftMonth(viewModel.currentMonth, -1)) }) { Text("←") }
                Text(viewModel.currentMonth, style = MaterialTheme.typography.titleMedium)
                TextButton(onClick = { viewModel.setMonth(shiftMonth(viewModel.currentMonth, 1)) }) { Text("→") }
            }
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(viewModel.expenses, key = { it.id }) { e ->
                    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text(e.category.icon)
                        Spacer(Modifier.width(8.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(e.category.name, fontWeight = FontWeight.Medium)
                            if (!e.notes.isNullOrBlank()) {
                                Text(e.notes, style = MaterialTheme.typography.bodySmall)
                            }
                            Text("${e.paidBy.name} · ${e.paymentMethod}", style = MaterialTheme.typography.bodySmall)
                        }
                        Text(money(e.amount), fontWeight = FontWeight.SemiBold)
                        IconButton(onClick = { toDelete = e }) {
                            Icon(Icons.Default.Delete, contentDescription = "Delete")
                        }
                    }
                }
            }
        }
    }

    if (showAdd) AddExpenseDialog(viewModel) { showAdd = false }
    toDelete?.let { expense ->
        AlertDialog(
            onDismissRequest = { toDelete = null },
            title = { Text("Delete expense?") },
            text = { Text("${expense.category.name} — ${money(expense.amount)}") },
            confirmButton = {
                TextButton(onClick = { viewModel.deleteExpense(expense.id); toDelete = null }) { Text("Delete") }
            },
            dismissButton = { TextButton(onClick = { toDelete = null }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun AddExpenseDialog(viewModel: AppViewModel, onDismiss: () -> Unit) {
    var amount by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    var categoryId by remember { mutableStateOf<String?>(null) }
    var method by remember { mutableStateOf("UPI") }
    val date = java.time.LocalDate.now().toString()
    val selectedCategoryId = categoryId ?: viewModel.categories.firstOrNull()?.id

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add expense") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(value = amount, onValueChange = { amount = it }, label = { Text("Amount") })
                ChipRow(
                    options = viewModel.categories.map { "${it.icon} ${it.name}" },
                    selectedIndex = viewModel.categories.indexOfFirst { it.id == selectedCategoryId },
                    onSelect = { index -> categoryId = viewModel.categories.getOrNull(index)?.id },
                )
                OutlinedTextField(value = notes, onValueChange = { notes = it }, label = { Text("Notes (optional)") })
                ChipRow(
                    options = METHODS,
                    selectedIndex = METHODS.indexOf(method),
                    onSelect = { index -> method = METHODS[index] },
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val catId = selectedCategoryId ?: return@Button
                    val value = amount.toDoubleOrNull() ?: return@Button
                    viewModel.addExpense(catId, value, date, method, notes.ifBlank { null })
                    onDismiss()
                },
                enabled = selectedCategoryId != null && amount.toDoubleOrNull() != null,
            ) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
fun ChipRow(options: List<String>, selectedIndex: Int, onSelect: (Int) -> Unit) {
    LazyColumn(modifier = Modifier.height(120.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        items(options.size) { index ->
            Row(modifier = Modifier.fillMaxWidth()) {
                TextButton(onClick = { onSelect(index) }) {
                    Text(
                        if (index == selectedIndex) "● ${options[index]}" else "○ ${options[index]}",
                        style = if (index == selectedIndex) MaterialTheme.typography.labelLarge else MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        }
    }
}

fun shiftMonth(month: String, delta: Int): String {
    val parts = month.split("-").map { it.toInt() }
    val cal = java.util.Calendar.getInstance()
    cal.set(parts[0], parts[1] - 1, 1)
    cal.add(java.util.Calendar.MONTH, delta)
    return "%04d-%02d".format(cal.get(java.util.Calendar.YEAR), cal.get(java.util.Calendar.MONTH) + 1)
}
