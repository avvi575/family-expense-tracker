package com.fet.app

import android.app.Application
import com.fet.app.data.ApiClient
import com.fet.app.data.SessionManager

class FetApp : Application() {
    override fun onCreate() {
        super.onCreate()
        ApiClient.init(SessionManager(this))
    }
}
