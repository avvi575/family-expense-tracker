package com.fet.app.ui.budgets

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.fet.app.ui.AppViewModel
import com.fet.app.ui.expenses.ChipRow
import com.fet.app.ui.money

@Composable
fun BudgetsScreen(viewModel: AppViewModel, modifier: Modifier = Modifier) {
    var showAdd by remember { mutableStateOf(false) }

    Column(modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Budgets · ${viewModel.currentMonth}", style = MaterialTheme.typography.titleMedium)
            Button(onClick = { showAdd = true }) { Text("Set budget") }
        }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items(viewModel.budgets.size) { index ->
                val b = viewModel.budgets[index]
                val pct = if (b.amount > 0) (b.spent / b.amount).toFloat() else 0f
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp)) {
                        Row(modifier = Modifier.fillMaxWidth()) {
                            Text("${b.category.icon} ${b.category.name}", modifier = Modifier.weight(1f), fontWeight = FontWeight.Medium)
                            Text(
                                "${money(b.spent)} / ${money(b.amount)}",
                                color = if (pct >= 1f) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                        LinearProgressIndicator(
                            progress = { pct.coerceIn(0f, 1f) },
                            modifier = Modifier.fillMaxWidth().height(8.dp).padding(top = 6.dp),
                        )
                    }
                }
            }
        }
    }

    if (showAdd) {
        var amount by remember { mutableStateOf("") }
        var categoryId by remember { mutableStateOf<String?>(null) }
        val selectedCategoryId = categoryId ?: viewModel.categories.firstOrNull()?.id
        AlertDialog(
            onDismissRequest = { showAdd = false },
            title = { Text("Set monthly budget") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    ChipRow(
                        options = viewModel.categories.map { "${it.icon} ${it.name}" },
                        selectedIndex = viewModel.categories.indexOfFirst { it.id == selectedCategoryId },
                        onSelect = { index -> categoryId = viewModel.categories.getOrNull(index)?.id },
                    )
                    OutlinedTextField(value = amount, onValueChange = { amount = it }, label = { Text("Amount") })
                }
            },
            confirmButton = {
                Button(onClick = {
                    val catId = selectedCategoryId ?: return@Button
                    val value = amount.toDoubleOrNull() ?: return@Button
                    viewModel.saveBudget(catId, value)
                    showAdd = false
                }) { Text("Save") }
            },
            dismissButton = { TextButton(onClick = { showAdd = false }) { Text("Cancel") } },
        )
    }
}
