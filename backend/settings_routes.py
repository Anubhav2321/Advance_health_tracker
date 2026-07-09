from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import logging
from datetime import datetime
import bcrypt
from backend.database import Database

router = APIRouter()
logger = logging.getLogger(__name__)

# ==========================================
# PYDANTIC MODELS FOR SETTINGS
# ==========================================
class ProfileSettings(BaseModel):
    goal: str
    current_weight_kg: float
    height_cm: float
    age: int
    gender: str
    activity_level: str

class ThemeSettings(BaseModel):
    mode: str  # "dark", "light", "system"
    accent_color: str  # "cyan", "purple", "green", "orange"

class RIASettings(BaseModel):
    tone: str  # "friendly", "strict", "professional"
    language: str  # "english", "banglish"

class NotificationSettings(BaseModel):
    water_reminder: bool
    workout_alert: bool
    meal_reminder: bool

class UserSettingsUpdate(BaseModel):
    user_email: str
    profile: ProfileSettings
    theme: ThemeSettings
    ria: RIASettings
    notifications: NotificationSettings

class PasswordChange(BaseModel):
    user_email: str
    old_password: str
    new_password: str

class DeleteAccount(BaseModel):
    user_email: str

# ==========================================
# MACRO RE-CALCULATION HELPER
# ==========================================
def calculate_macros(profile: ProfileSettings):
    if profile.gender.lower() == "male":
        bmr = (10 * profile.current_weight_kg) + (6.25 * profile.height_cm) - (5 * profile.age) + 5
    else:
        bmr = (10 * profile.current_weight_kg) + (6.25 * profile.height_cm) - (5 * profile.age) - 161

    activity_multipliers = {
        "sedentary": 1.2, "light": 1.375, "moderate": 1.55,
        "active": 1.725, "very_active": 1.9
    }
    multiplier = activity_multipliers.get(profile.activity_level.lower(), 1.2)
    tdee = bmr * multiplier

    if profile.goal == "weight_loss":
        target_calories = tdee - 500 
    elif profile.goal == "muscle_gain":
        target_calories = tdee + 300 
    else:
        target_calories = tdee 

    protein = profile.current_weight_kg * 2.2
    fats = (target_calories * 0.25) / 9
    carbs = (target_calories - (protein * 4) - (fats * 9)) / 4
    water = 2.5 + (profile.current_weight_kg * 0.03)

    return {
        "target_calories": int(target_calories),
        "target_protein_g": int(protein),
        "target_fats_g": int(fats),
        "target_carbs_g": int(carbs),
        "target_water_l": round(water, 1)
    }

# ==========================================
# SETTINGS API ROUTES
# ==========================================

@router.get("/{user_email}")
async def get_user_settings(user_email: str):
    """Fetches user profile and specific settings. Creates default if missing."""
    try:
        db = Database.db
        user = await db.users.find_one({"email": user_email})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        settings = await db.user_settings.find_one({"user_email": user_email})
        
        # Default Settings Fallback
        if not settings:
            settings = {
                "theme": {"mode": "dark", "accent_color": "cyan"},
                "ria": {"tone": "friendly", "language": "english"},
                "notifications": {"water_reminder": True, "workout_alert": True, "meal_reminder": True}
            }
            
        return {
            "status": "success",
            "data": {
                "profile": {
                    "goal": user.get("goal", "maintenance"),
                    "current_weight_kg": user.get("current_weight_kg", 70.0),
                    "height_cm": user.get("height_cm", 175.0),
                    "age": user.get("age", 25),
                    "gender": user.get("gender", "male"),
                    "activity_level": user.get("activity_level", "sedentary")
                },
                "theme": settings["theme"],
                "ria": settings["ria"],
                "notifications": settings["notifications"]
            }
        }
    except Exception as e:
        logger.error(f"Error fetching settings: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch Matrix configurations.")

@router.post("/update")
async def update_user_settings(data: UserSettingsUpdate):
    """Updates settings AND recalculates calories/macros if body stats changed."""
    try:
        db = Database.db
        
        # 1. Update the generic settings table
        await db.user_settings.update_one(
            {"user_email": data.user_email},
            {"$set": {
                "theme": data.theme.model_dump(),
                "ria": data.ria.model_dump(),
                "notifications": data.notifications.model_dump(),
                "updated_at": datetime.utcnow().isoformat()
            }},
            upsert=True
        )

        # 2. Recalculate Macros based on new input
        new_macros = calculate_macros(data.profile)
        
        # 3. Update main User table
        await db.users.update_one(
            {"email": data.user_email},
            {"$set": {
                "goal": data.profile.goal,
                "current_weight_kg": data.profile.current_weight_kg,
                "height_cm": data.profile.height_cm,
                "age": data.profile.age,
                "gender": data.profile.gender,
                "activity_level": data.profile.activity_level,
                **new_macros
            }}
        )
        return {"status": "success", "message": "System Settings and Bio-Macros updated successfully."}
    except Exception as e:
        logger.error(f"Error updating settings: {e}")
        raise HTTPException(status_code=500, detail="Matrix synchronization failed.")

@router.post("/change-password")
async def change_password(data: PasswordChange):
    """Changes password for locally registered accounts."""
    try:
        db = Database.db
        user = await db.users.find_one({"email": data.user_email})
        
        if not user or user.get("auth_provider") != "local":
            raise HTTPException(status_code=400, detail="Cannot change password for Google Auth accounts.")
        
        if not bcrypt.checkpw(data.old_password.encode('utf-8'), user["password_hash"].encode('utf-8')):
            raise HTTPException(status_code=400, detail="Old password incorrect.")

        salt = bcrypt.gensalt()
        new_hash = bcrypt.hashpw(data.new_password.encode('utf-8'), salt).decode('utf-8')

        await db.users.update_one({"email": data.user_email}, {"$set": {"password_hash": new_hash}})
        return {"status": "success", "message": "Security key updated."}
    except Exception as e:
        logger.error(f"Password Change Error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/export/{user_email}")
async def export_matrix_data(user_email: str):
    """Compiles all user logs into one clean JSON export object."""
    try:
        db = Database.db
        profile = await db.users.find_one({"email": user_email}, {"_id": 0, "password_hash": 0})
        health = await db.health_logs.find({"user_email": user_email}, {"_id": 0}).to_list(None)
        workouts = await db.workout_logs.find({"user_email": user_email}, {"_id": 0}).to_list(None)
        diet = await db.diet_logs.find({"user_email": user_email}, {"_id": 0}).to_list(None)

        return {
            "status": "success",
            "export_data": {
                "profile_and_macros": profile,
                "daily_health_logs": health,
                "workout_routines_history": workouts,
                "diet_food_history": diet
            }
        }
    except Exception as e:
        logger.error(f"Export Error: {e}")
        raise HTTPException(status_code=500, detail="Data compilation failed.")

@router.post("/delete-account")
async def delete_matrix_account(data: DeleteAccount):
    """Permanently erases all user footprints from the database."""
    try:
        db = Database.db
        email = data.user_email
        await db.users.delete_one({"email": email})
        await db.user_settings.delete_one({"user_email": email})
        await db.health_logs.delete_many({"user_email": email})
        await db.workout_logs.delete_many({"user_email": email})
        await db.diet_logs.delete_many({"user_email": email})
        
        return {"status": "success", "message": "All traces erased from Matrix."}
    except Exception as e:
        logger.error(f"Delete Error: {e}")
        raise HTTPException(status_code=500, detail="Erase protocol failed.")