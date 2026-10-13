package com.fet.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Indigo = Color(0xFF4F46E5)
val IndigoLight = Color(0xFFEEF2FF)
val Emerald = Color(0xFF10B981)
val Amber = Color(0xFFF59E0B)
val Red = Color(0xFFEF4444)

private val LightColors = lightColorScheme(
    primary = Indigo,
    primaryContainer = IndigoLight,
    secondary = Emerald,
    tertiary = Amber,
    error = Red,
)

@Composable
fun FetAppTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (isSystemInDarkTheme()) darkColorScheme(primary = Indigo) else LightColors,
        content = content,
    )
}
