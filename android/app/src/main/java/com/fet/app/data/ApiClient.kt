package com.fet.app.data

import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface FetApi {
    @POST("auth/register")
    suspend fun register(@Body body: RegisterRequest): AuthResponse

    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): AuthResponse

    @GET("families/me")
    suspend fun myFamilies(): List<FamilySummary>

    @POST("families")
    suspend fun createFamily(@Body body: CreateFamilyRequest): FamilySummary

    @POST("families/join")
    suspend fun joinFamily(@Body body: JoinFamilyRequest)

    @GET("families/{id}/members")
    suspend fun members(@Path("id") familyId: String): List<MemberDto>

    @POST("families/{id}/invite")
    suspend fun invite(@Path("id") familyId: String, @Body body: InviteRequest): InviteResponse

    @GET("categories")
    suspend fun categories(@Query("familyId") familyId: String): List<CategoryDto>

    @GET("expenses")
    suspend fun expenses(
        @Query("familyId") familyId: String,
        @Query("month") month: String,
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 100,
    ): ExpensePageDto

    @POST("expenses")
    suspend fun createExpense(@Body body: CreateExpenseRequest): ExpenseDto

    @DELETE("expenses/{id}")
    suspend fun deleteExpense(@Path("id") id: String)

    @GET("budgets")
    suspend fun budgets(@Query("familyId") familyId: String, @Query("month") month: String): BudgetListDto

    @POST("budgets")
    suspend fun saveBudget(@Body body: SaveBudgetRequest)

    @GET("goals")
    suspend fun goals(@Query("familyId") familyId: String): List<GoalDto>

    @POST("goals")
    suspend fun createGoal(@Body body: CreateGoalRequest): GoalDto

    @POST("goals/{id}/contribute")
    suspend fun contributeGoal(@Path("id") id: String, @Body body: ContributeRequest): GoalDto

    @GET("notifications")
    suspend fun notifications(): List<NotificationDto>

    @POST("notifications/{id}/read")
    suspend fun markRead(@Path("id") id: String)

    @GET("reports/summary")
    suspend fun summary(@Query("familyId") familyId: String, @Query("month") month: String): SummaryDto
}

object ApiClient {
    const val BASE_URL = "http://10.0.2.2:3000/api/v1/"

    lateinit var session: SessionManager
        private set

    private val json = Json { ignoreUnknownKeys = true }

    private val authInterceptor = okhttp3.Interceptor { chain ->
        val request = chain.request().newBuilder()
            .apply { session.token?.let { addHeader("Authorization", "Bearer $it") } }
            .build()
        chain.proceed(request)
    }

    val api: FetApi by lazy {
        Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(OkHttpClient.Builder().addInterceptor(authInterceptor).build())
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(FetApi::class.java)
    }

    fun init(session: SessionManager) {
        this.session = session
    }
}
