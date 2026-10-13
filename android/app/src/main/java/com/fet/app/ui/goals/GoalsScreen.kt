package com.fet.app.ui.goals

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
import com.fet.app.ui.money

@Composable
fun GoalsScreen(viewModel: AppViewModel, modifier: Modifier = Modifier) {
    var showAdd by remember { mutableStateOf(false) }
    var contributeFor by remember { mutableStateOf<String?>(null) }

    Column(modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Savings goals", style = MaterialTheme.typography.titleMedium)
            Button(onClick = { showAdd = true }) { Text("New goal") }
        }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items(viewModel.goals.size) { index ->
                val g = viewModel.goals[index]
                val pct = if (g.targetAmount > 0) (g.savedAmount / g.targetAmount).toFloat() else 0f
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(g.name, fontWeight = FontWeight.Medium)
                        LinearProgressIndicator(
                            progress = { pct.coerceIn(0f, 1f) },
                            modifier = Modifier.fillMaxWidth().height(8.dp),
                        )
                        Text(
                            "${money(g.savedAmount)} of ${money(g.targetAmount)} (${(pct * 100).toInt()}%)",
                            style = MaterialTheme.typography.bodySmall,
                        )
                        Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
                            TextButton(onClick = { contributeFor = g.id }) { Text("Contribute") }
                        }
                    }
                }
            }
        }
    }

    if (showAdd) {
        var name by remember { mutableStateOf("") }
        var target by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showAdd = false },
            title = { Text("New savings goal") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Goal name") })
                    OutlinedTextField(value = target, onValueChange = { target = it }, label = { Text("Target amount") })
                }
            },
            confirmButton = {
                Button(onClick = {
                    val value = target.toDoubleOrNull() ?: return@Button
                    viewModel.createGoal(name.ifBlank { "Goal" }, value)
                    showAdd = false
                }) { Text("Create") }
            },
            dismissButton = { TextButton(onClick = { showAdd = false }) { Text("Cancel") } },
        )
    }

    contributeFor?.let { goalId ->
        var amount by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { contributeFor = null },
            title = { Text("Add to goal") },
            text = {
                OutlinedTextField(value = amount, onValueChange = { amount = it }, label = { Text("Amount") })
            },
            confirmButton = {
                Button(onClick = {
                    val value = amount.toDoubleOrNull() ?: return@Button
                    viewModel.contribute(goalId, value)
                    contributeFor = null
                }) { Text("Add") }
            },
            dismissButton = { TextButton(onClick = { contributeFor = null }) { Text("Cancel") } },
        )
    }
}
