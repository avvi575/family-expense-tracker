package com.fet.app.data

import kotlinx.serialization.Serializable

@Serializable
data class AuthResponse(val accessToken: String, val user: UserDto)

@Serializable
data class UserDto(val id: String, val email: String, val name: String)

@Serializable
data class RegisterRequest(val name: String, val email: String, val password: String)

@Serializable
data class LoginRequest(val email: String, val password: String)

@Serializable
data class FamilySummary(val id: String, val name: String, val role: String)

@Serializable
data class CreateFamilyRequest(val name: String)

@Serializable
data class JoinFamilyRequest(val token: String)

@Serializable
data class InviteRequest(val email: String, val role: String)

@Serializable
data class InviteResponse(val inviteToken: String, val email: String, val role: String)

@Serializable
data class MemberDto(val id: String, val role: String, val user: UserDto)

@Serializable
data class CategoryDto(val id: String, val name: String, val icon: String, val color: String)

@Serializable
data class PaidByDto(val id: String, val name: String)

@Serializable
data class ExpenseDto(
    val id: String,
    val amount: Double,
    val date: String,
    val paymentMethod: String,
    val notes: String? = null,
    val receiptUrl: String? = null,
    val paidBy: PaidByDto,
    val category: CategoryDto,
)

@Serializable
data class ExpensePageDto(val items: List<ExpenseDto>, val total: Int, val page: Int, val limit: Int)

@Serializable
data class CreateExpenseRequest(
    val familyId: String,
    val categoryId: String,
    val amount: Double,
    val date: String,
    val paymentMethod: String,
    val notes: String? = null,
    val receiptUrl: String? = null,
)

@Serializable
data class BudgetItemDto(
    val id: String,
    val categoryId: String,
    val amount: Double,
    val month: String,
    val spent: Double,
    val category: CategoryDto,
)

@Serializable
data class BudgetListDto(val items: List<BudgetItemDto>)

@Serializable
data class SaveBudgetRequest(val familyId: String, val categoryId: String, val month: String, val amount: Double)

@Serializable
data class GoalDto(
    val id: String,
    val name: String,
    val targetAmount: Double,
    val savedAmount: Double,
    val deadline: String? = null,
)

@Serializable
data class CreateGoalRequest(val familyId: String, val name: String, val targetAmount: Double, val deadline: String? = null)

@Serializable
data class ContributeRequest(val amount: Double)

@Serializable
data class NotificationDto(
    val id: String,
    val type: String,
    val title: String,
    val message: String,
    val read: Boolean,
    val createdAt: String,
)

@Serializable
data class CategoryTotal(val categoryId: String, val name: String, val color: String, val total: Double)

@Serializable
data class MemberTotal(val userId: String, val name: String, val total: Double)

@Serializable
data class DailyTotal(val date: String, val total: Double)

@Serializable
data class SummaryDto(
    val totalSpent: Double,
    val byCategory: List<CategoryTotal>,
    val byMember: List<MemberTotal>,
    val dailyTotals: List<DailyTotal>,
)
