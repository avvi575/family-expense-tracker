package com.fet.app.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.PieChart
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import com.fet.app.Screen
import com.fet.app.ui.AppViewModel
import com.fet.app.ui.auth.LoginScreen
import com.fet.app.ui.auth.RegisterScreen
import com.fet.app.ui.budgets.BudgetsScreen
import com.fet.app.ui.dashboard.DashboardScreen
import com.fet.app.ui.expenses.ExpensesScreen
import com.fet.app.ui.goals.GoalsScreen
import com.fet.app.ui.more.MoreScreen

private data class Tab(val label: String, val icon: ImageVector)

@Composable
fun AppNav(navController: NavHostController, viewModel: AppViewModel, loggedIn: Boolean) {
    val start = if (loggedIn) "home" else Screen.Login.route

    NavHost(navController = navController, startDestination = start) {
        composable(Screen.Login.route) { LoginScreen(navController, viewModel) }
        composable(Screen.Register.route) { RegisterScreen(navController, viewModel) }
        composable(Screen.Home.route) { HomeTabs(viewModel, onLogout = {
            navController.navigate(Screen.Login.route) { popUpTo(0) }
        }) }
    }
}

@Composable
private fun HomeTabs(viewModel: AppViewModel, onLogout: () -> Unit) {
    var selected by remember { mutableStateOf(0) }
    val tabs = listOf(
        Tab("Dashboard", Icons.Default.PieChart),
        Tab("Expenses", Icons.Default.AccountBalanceWallet),
        Tab("Budgets", Icons.Default.Flag),
        Tab("Goals", Icons.Default.Flag),
        Tab("More", Icons.Default.MoreHoriz),
    )

    Scaffold(
        bottomBar = {
            NavigationBar {
                tabs.forEachIndexed { index, tab ->
                    NavigationBarItem(
                        selected = selected == index,
                        onClick = { selected = index },
                        icon = { Icon(tab.icon, contentDescription = tab.label) },
                        label = { Text(tab.label) },
                    )
                }
            }
        }
    ) { padding ->
        val modifier = Modifier.padding(padding)
        when (selected) {
            0 -> DashboardScreen(viewModel, modifier)
            1 -> ExpensesScreen(viewModel, modifier)
            2 -> BudgetsScreen(viewModel, modifier)
            3 -> GoalsScreen(viewModel, modifier)
            else -> MoreScreen(viewModel, modifier, onLogout)
        }
    }
}
