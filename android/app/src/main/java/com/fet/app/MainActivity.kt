package com.fet.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.lifecycle.lifecycleScope
import com.fet.app.data.ApiClient
import com.fet.app.navigation.AppNav
import com.fet.app.ui.AppViewModel
import com.fet.app.ui.theme.FetAppTheme
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private val viewModel: AppViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val loggedIn = ApiClient.session.token != null
        if (loggedIn) {
            lifecycleScope.launch {
                viewModel.loadFamilies()
                viewModel.refreshAll()
                viewModel.families.first()
            }
        }
        setContent {
            FetAppTheme {
                AppNav(
                    navController = androidx.navigation.compose.rememberNavController(),
                    viewModel = viewModel,
                    loggedIn = loggedIn,
                )
            }
        }
    }
}
