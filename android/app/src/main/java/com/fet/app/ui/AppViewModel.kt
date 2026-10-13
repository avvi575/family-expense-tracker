package com.fet.app.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fet.app.data.ApiClient
import com.fet.app.data.AuthResponse
import com.fet.app.data.BudgetItemDto
import com.fet.app.data.CategoryDto
import com.fet.app.data.ContributeRequest
import com.fet.app.data.CreateExpenseRequest
import com.fet.app.data.CreateGoalRequest
import com.fet.app.data.CreateFamilyRequest
import com.fet.app.data.ExpenseDto
import com.fet.app.data.FamilySummary
import com.fet.app.data.GoalDto
import com.fet.app.data.InviteRequest
import com.fet.app.data.JoinFamilyRequest
import com.fet.app.data.LoginRequest
import com.fet.app.data.MemberDto
import com.fet.app.data.NotificationDto
import com.fet.app.data.RegisterRequest
import com.fet.app.data.SaveBudgetRequest
import com.fet.app.data.SummaryDto
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.util.Currency
import java.util.Locale

fun money(v: Double): String {
    val fmt = NumberFormat.getCurrencyInstance(Locale("en", "IN"))
    fmt.maximumFractionDigits = 0
    return fmt.format(v)
}

class AppViewModel : ViewModel() {
    private val api get() = ApiClient.api

    var error by mutableStateOf<String?>(null)
        private set

    val token: String? get() = ApiClient.session.token

    private val _families = MutableStateFlow<List<FamilySummary>>(emptyList())
    val families: StateFlow<List<FamilySummary>> = _families

    var activeFamily by mutableStateOf<FamilySummary?>(null)
        private set

    var currentMonth by mutableStateOf(monthNow())
    var categories by mutableStateOf<List<CategoryDto>>(emptyList())
    var expenses by mutableStateOf<List<ExpenseDto>>(emptyList())
    var budgets by mutableStateOf<List<BudgetItemDto>>(emptyList())
    var goals by mutableStateOf<List<GoalDto>>(emptyList())
    var notifications by mutableStateOf<List<NotificationDto>>(emptyList())
    var members by mutableStateOf<List<MemberDto>>(emptyList())
    var summary by mutableStateOf<SummaryDto?>(null)
    var busy by mutableStateOf(false)
        private set

    fun monthNow(): String {
        val c = java.util.Calendar.getInstance()
        return "%04d-%02d".format(c.get(java.util.Calendar.YEAR), c.get(java.util.Calendar.MONTH) + 1)
    }

    private fun launch(block: suspend () -> Unit) {
        viewModelScope.launch {
            busy = true
            error = null
            try {
                block()
            } catch (e: Exception) {
                error = e.message ?: "Request failed"
            } finally {
                busy = false
            }
        }
    }

    fun login(email: String, password: String, onSuccess: () -> Unit) = launch {
        val res: AuthResponse = api.login(LoginRequest(email, password))
        ApiClient.session.token = res.accessToken
        ApiClient.session.userId = res.user.id
        ApiClient.session.userName = res.user.name
        loadFamilies()
        onSuccess()
    }

    fun register(name: String, email: String, password: String, onSuccess: () -> Unit) = launch {
        val res = api.register(RegisterRequest(name, email, password))
        ApiClient.session.token = res.accessToken
        ApiClient.session.userId = res.user.id
        ApiClient.session.userName = res.user.name
        loadFamilies()
        onSuccess()
    }

    fun logout() {
        ApiClient.session.clear()
        _families.value = emptyList()
        activeFamily = null
    }

    fun loadFamilies(after: () -> Unit = {}) = launch {
        _families.value = api.myFamilies()
        if (activeFamily == null) activeFamily = _families.value.firstOrNull()
        after()
    }

    fun selectFamily(family: FamilySummary) {
        activeFamily = family
        ApiClient.session.familyId = family.id
        refreshAll()
    }

    fun createFamily(name: String) = launch {
        api.createFamily(CreateFamilyRequest(name))
        loadFamilies()
    }

    fun joinFamily(tokenText: String) = launch {
        api.joinFamily(JoinFamilyRequest(tokenText.trim()))
        loadFamilies()
    }

    fun refreshAll() {
        val family = activeFamily ?: return
        ApiClient.session.familyId = family.id
        launch { categories = api.categories(family.id) }
        launch { expenses = api.expenses(family.id, currentMonth).items }
        launch { budgets = api.budgets(family.id, currentMonth).items }
        launch { goals = api.goals(family.id) }
        launch { summary = api.summary(family.id, currentMonth) }
        launch { members = api.members(family.id) }
        launch { notifications = api.notifications() }
    }

    fun setMonth(month: String) {
        currentMonth = month
        refreshAll()
    }

    fun addExpense(categoryId: String, amount: Double, date: String, method: String, notes: String?) = launch {
        val family = activeFamily ?: return@launch
        api.createExpense(CreateExpenseRequest(family.id, categoryId, amount, date, method, notes))
        expenses = api.expenses(family.id, currentMonth).items
        summary = api.summary(family.id, currentMonth)
    }

    fun deleteExpense(id: String) = launch {
        api.deleteExpense(id)
        val family = activeFamily ?: return@launch
        expenses = api.expenses(family.id, currentMonth).items
        summary = api.summary(family.id, currentMonth)
    }

    fun saveBudget(categoryId: String, amount: Double) = launch {
        val family = activeFamily ?: return@launch
        api.saveBudget(SaveBudgetRequest(family.id, categoryId, currentMonth, amount))
        budgets = api.budgets(family.id, currentMonth).items
    }

    fun createGoal(name: String, target: Double) = launch {
        val family = activeFamily ?: return@launch
        api.createGoal(CreateGoalRequest(family.id, name, target))
        goals = api.goals(family.id)
    }

    fun contribute(goalId: String, amount: Double) = launch {
        api.contributeGoal(goalId, ContributeRequest(amount))
        goals = api.goals(activeFamily?.id ?: return@launch)
    }

    fun inviteMember(email: String, role: String) = launch {
        val family = activeFamily ?: return@launch
        api.invite(family.id, InviteRequest(email, role))
        members = api.members(family.id)
    }

    fun markRead(id: String) = launch {
        api.markRead(id)
        notifications = api.notifications()
    }
}
