package com.fet.app.ui.more

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
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
import com.fet.app.data.ApiClient
import com.fet.app.ui.AppViewModel

@Composable
fun MoreScreen(viewModel: AppViewModel, modifier: Modifier = Modifier, onLogout: () -> Unit) {
    var tab by remember { mutableStateOf(0) }

    Column(modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            TextButton(onClick = { tab = 0 }) { Text(if (tab == 0) "[Members]" else "Members") }
            TextButton(onClick = { tab = 1 }) { Text(if (tab == 1) "[Alerts]" else "Alerts") }
            TextButton(onClick = { onLogout() }) { Text("Logout") }
        }
        when (tab) {
            0 -> MembersTab(viewModel)
            else -> NotificationsTab(viewModel)
        }
    }
}

@Composable
private fun MembersTab(viewModel: AppViewModel) {
    var showInvite by remember { mutableStateOf(false) }
    var joinToken by remember { mutableStateOf("") }
    var message by remember { mutableStateOf<String?>(null) }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (viewModel.families.isEmpty()) {
            Button(onClick = { viewModel.createFamily("My Family") }) { Text("Create family") }
        } else {
            Text("Family: ${viewModel.activeFamily?.name ?: "-"}", fontWeight = FontWeight.Medium)
        }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.weight(1f, fill = false)) {
            items(viewModel.members.size) { index ->
                val m = viewModel.members[index]
                Row(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(m.user.name)
                        Text(m.user.email, style = MaterialTheme.typography.bodySmall)
                    }
                    Text(m.role, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                }
            }
        }
        Button(onClick = { showInvite = true }) { Text("Invite member") }
        OutlinedTextField(
            value = joinToken,
            onValueChange = { joinToken = it },
            label = { Text("Join with invite token") },
            modifier = Modifier.fillMaxWidth(),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = {
                viewModel.joinFamily(joinToken)
                message = "Join requested"
            }, enabled = joinToken.isNotBlank()) { Text("Join") }
            message?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
        }
    }

    if (showInvite) {
        var email by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showInvite = false },
            title = { Text("Invite member") },
            text = { OutlinedTextField(value = email, onValueChange = { email = it }, label = { Text("Email") }) },
            confirmButton = {
                Button(onClick = {
                    if (email.contains('@')) viewModel.inviteMember(email.trim(), "MEMBER")
                    showInvite = false
                }) { Text("Send") }
            },
            dismissButton = { TextButton(onClick = { showInvite = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun NotificationsTab(viewModel: AppViewModel) {
    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items(viewModel.notifications.size) { index ->
            val n = viewModel.notifications[index]
            Card(modifier = Modifier.fillMaxWidth()) {
                Row(Modifier.padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(n.title, fontWeight = if (n.read) FontWeight.Normal else FontWeight.Bold)
                        Text(n.message, style = MaterialTheme.typography.bodySmall)
                    }
                    if (!n.read) {
                        TextButton(onClick = { viewModel.markRead(n.id) }) { Text("Read") }
                    }
                }
            }
        }
    }
}
