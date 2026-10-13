package com.fet.app.ui.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.fet.app.ui.AppViewModel
import com.fet.app.ui.money

@Composable
fun DashboardScreen(viewModel: AppViewModel, modifier: Modifier = Modifier) {
    val summary = viewModel.summary

    LazyColumn(
        modifier = modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Total spent this month", style = MaterialTheme.typography.bodySmall)
                    Text(money(summary?.totalSpent ?: 0.0), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                }
            }
        }
        item {
            Text("By category", style = MaterialTheme.typography.titleMedium)
        }
        items(summary?.byCategory ?: emptyList()) { cat ->
            val max = summary?.byCategory?.maxOfOrNull { it.total } ?: 1.0
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .width(10.dp)
                        .height(10.dp)
                        .background(parseColor(cat.color), CircleShape)
                )
                Spacer(Modifier.width(8.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(cat.name, style = MaterialTheme.typography.bodyMedium)
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(fraction = (cat.total / max).toFloat().coerceIn(0.05f, 1f))
                            .height(6.dp)
                            .background(parseColor(cat.color))
                    )
                }
                Spacer(Modifier.width(8.dp))
                Text(money(cat.total), style = MaterialTheme.typography.bodySmall)
            }
        }
        item {
            Text("By member", style = MaterialTheme.typography.titleMedium)
        }
        items(summary?.byMember ?: emptyList()) { member ->
            Row(modifier = Modifier.fillMaxWidth()) {
                Text(member.name, modifier = Modifier.weight(1f))
                Text(money(member.total), fontWeight = FontWeight.Medium)
            }
        }
    }

    LaunchedEffect(viewModel.activeFamily, viewModel.currentMonth) {
        viewModel.refreshAll()
    }
}

fun parseColor(hex: String): Color = try {
    Color(android.graphics.Color.parseColor(hex))
} catch (e: Exception) {
    Color.Gray
}
