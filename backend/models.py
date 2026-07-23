from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from datetime import date

# ==========================================
# 1. User Onboarding & Profile Models
# ==========================================

class UserOnboarding(BaseModel):
    """
    Schema for the initial data user provides during onboarding.
    """
    name: str = Field(..., example="Anubhav Samanta")
    email: EmailStr = Field(..., description="Unique email from Google Auth")
    age: int = Field(..., description="User's age in years")
    gender: str = Field(..., description="'male' or 'female'")
    height_cm: float = Field(..., description="Height in centimeters")
    current_weight_kg: float = Field(..., description="Current weight in kg")
    target_weight_kg: float = Field(..., description="Target weight in kg")
    goal: str = Field(..., description="'weight_loss', 'muscle_gain', or 'maintenance'")
    activity_level: str = Field(..., description="'sedentary', 'light', 'moderate', 'active', 'very_active'")
    medical_conditions: Optional[List[str]] = Field(default=[], description="List of any medical conditions")

class UserProfile(UserOnboarding):
    """
    Schema for User Profile. 
    Inherits onboarding data and adds backend-calculated macros and profile image.
    """
    profile_image: Optional[str] = None
    
    # Calculated Macros (Backend will generate these based on Onboarding data)
    target_calories: int = 0
    target_protein_g: int = 0
    target_carbs_g: int = 0
    target_fats_g: int = 0
    target_water_l: float = 0.0
    
    created_at: str = Field(default_factory=lambda: date.today().isoformat())


# ==========================================
# 2. Daily Health Tracking Models
# ==========================================

class DailyHealthLog(BaseModel):
    """
    Schema for tracking daily user inputs.
    Values default to 0 if not updated by the user.
    """
    user_email: EmailStr = Field(..., description="Links the log to a specific user")
    log_date: str = Field(..., description="Format: YYYY-MM-DD")
    calories: int = Field(default=0, ge=0, description="Calories consumed (kcal)")
    water_liters: float = Field(default=0.0, ge=0.0, description="Water intake in liters")
    sleep_hours: float = Field(default=0.0, ge=0.0, description="Hours of sleep")
    steps: int = Field(default=0, ge=0, description="Total daily steps")


class DetailedHealthLog(BaseModel):
    """
    Schema for detailed health tracking (mood, energy, weight, heart rate, notes).
    Stored alongside basic health log data.
    """
    user_email: EmailStr = Field(..., description="Links the log to a specific user")
    log_date: str = Field(..., description="Format: YYYY-MM-DD")
    mood: Optional[str] = Field(default="okay", description="great, good, okay, low, bad")
    energy_level: Optional[int] = Field(default=3, ge=1, le=5, description="Energy 1-5")
    weight_kg: Optional[float] = Field(default=0.0, ge=0.0, description="Daily weight check-in")
    heart_rate: Optional[int] = Field(default=0, ge=0, description="Resting heart rate BPM")
    notes: Optional[str] = Field(default="", description="Free-form daily notes")

class AIInsightResponse(BaseModel):
    """ 
    Schema for returning Groq AI generated insights 
    """
    insight_text: str


# ==========================================
# 3. Authentication Models
# ==========================================

class UserRegister(BaseModel):
    """ Schema for Manual Registration """
    name: str = Field(..., example="Anubhav Samanta")
    email: EmailStr = Field(...)
    password: str = Field(..., min_length=6, description="Minimum 6 characters")

class UserLogin(BaseModel):
    """ Schema for Manual Login """
    email: EmailStr = Field(...)
    password: str = Field(...)

class GoogleAuthRequest(BaseModel):
    """ Schema for Google OAuth Login """
    token: str = Field(..., description="Google ID token received from frontend")

class TokenResponse(BaseModel):
    """ Schema for JWT Token Response """
    access_token: str
    token_type: str = "bearer"
    is_onboarded: bool = False  # To check if user needs to fill onboarding form