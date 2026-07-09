from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import logging
import os
from datetime import datetime
from groq import AsyncGroq
from backend.database import Database

router = APIRouter()
logger = logging.getLogger(__name__)

# ==========================================
# PYDANTIC MODELS (Strict Data Validation)
# ==========================================
class ExerciseSet(BaseModel):
    kg: float
    reps: int
    completed: bool

class ExerciseLog(BaseModel):
    name: str
    muscle: str
    sets: int
    reps: int
    set_details: List[ExerciseSet]

class WorkoutSync(BaseModel):
    user_email: str
    date: str
    exercises: List[ExerciseLog]
    total_volume_kg: float

class AIWorkoutRequest(BaseModel):
    user_email: str
    target_muscle: str
    fitness_level: Optional[str] = "intermediate"

class WorkoutReset(BaseModel):
    user_email: str

# ==========================================
# DEFAULT CYBER ROUTINE (Matrix Fallback)
# ==========================================
DEFAULT_ROUTINE = [
    {"name": "Cyber Pushups", "muscle": "Chest & Triceps", "sets": 3, "reps": 15},
    {"name": "Neon Squats", "muscle": "Quads & Glutes", "sets": 4, "reps": 12},
    {"name": "Matrix Pull-ups", "muscle": "Back & Biceps", "sets": 3, "reps": 10},
    {"name": "Holo Core Crunches", "muscle": "Abs", "sets": 3, "reps": 20},
    {"name": "Neural Deadlifts", "muscle": "Back & Hamstrings", "sets": 3, "reps": 8}
]

# ==========================================
# HELPER FOR GROQ AI (AI Workout Engine)
# ==========================================
def get_groq_client():
    """Returns the Groq client if the API key is properly configured."""
    groq_api_key = os.environ.get("GROQ_API_KEY", "YOUR_GROQ_API_KEY_HERE")
    if groq_api_key == "YOUR_GROQ_API_KEY_HERE":
        return None
    return AsyncGroq(api_key=groq_api_key)


# ==========================================
# 1. CORE WORKOUT ROUTE: GET TODAY'S ROUTINE
# ==========================================
@router.get("/today/{user_email}")
async def get_daily_workout(user_email: str):
    """
    Fetches today's workout. If it's a new day, creates a fresh routine automatically.
    Maintains all previous logic while enabling new auto-save arrays.
    """
    try:
        db = Database.db
        today = datetime.utcnow().strftime("%Y-%m-%d")
        
        # Check if today's workout already exists in DB
        workout = await db.workout_logs.find_one({"user_email": user_email, "date": today})
        
        if not workout:
            # Create a fresh Matrix Routine for today with empty progress
            initial_exercises = []
            for ex in DEFAULT_ROUTINE:
                sets_arr = [{"kg": 0.0, "reps": ex["reps"], "completed": False} for _ in range(ex["sets"])]
                initial_exercises.append({
                    "name": ex["name"],
                    "muscle": ex["muscle"],
                    "sets": ex["sets"],
                    "reps": ex["reps"],
                    "set_details": sets_arr
                })
                
            workout = {
                "user_email": user_email,
                "date": today,
                "exercises": initial_exercises,
                "total_volume_kg": 0,
                "created_at": datetime.utcnow().isoformat()
            }
            # Save the fresh routine to DB so Auto-Save has a target
            await db.workout_logs.insert_one(workout.copy())
        
        workout.pop("_id", None)
        return {"status": "success", "routine": workout["exercises"]}
        
    except Exception as e:
        logger.error(f"Workout Fetch Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to load workout data")


# ==========================================
# 2. AUTO-SAVE & SYNC WORKOUT ROUTE
# ==========================================
@router.post("/log")
async def sync_workout(data: WorkoutSync):
    """
    Auto-saves the exact progress of the user into the database.
    Also calculates total volume which is directly sent to the Stats Dashboard.
    """
    try:
        db = Database.db
        update_data = data.model_dump()
        
        # Update the exact state in the database dynamically (Auto-Save Magic)
        await db.workout_logs.update_one(
            {"user_email": data.user_email, "date": data.date},
            {"$set": {
                "exercises": update_data["exercises"],
                "total_volume_kg": update_data["total_volume_kg"],
                "last_synced": datetime.utcnow().isoformat()
            }},
            upsert=True
        )
        return {"status": "success", "message": "Workout perfectly synced to Matrix"}
    except Exception as e:
        logger.error(f"Workout Auto-Sync Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to sync workout")


# ==========================================
# 3. WORKOUT HISTORY ROUTE (FOR STATS & GRAPHS)
# ==========================================
@router.get("/history/{user_email}")
async def get_workout_history(user_email: str, limit: int = 7):
    """
    Fetches previous workout history for advanced tracking and stats rendering.
    This was part of the original logic to populate user history.
    """
    try:
        db = Database.db
        cursor = db.workout_logs.find({"user_email": user_email}).sort("date", -1).limit(limit)
        history = await cursor.to_list(length=limit)
        
        for doc in history:
            doc.pop("_id", None)
            
        return {"status": "success", "data": history}
    except Exception as e:
        logger.error(f"History Fetch Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch history")


# ==========================================
# 4. AI WORKOUT GENERATOR ROUTE
# ==========================================
@router.post("/generate-ai")
async def generate_ai_routine(req: AIWorkoutRequest):
    """
    Generates a smart AI routine if the user wants to train a specific muscle group.
    Uses Llama-3 (Groq) for customized cyber-fitness generation.
    """
    try:
        client = get_groq_client()
        if not client:
            return {"status": "error", "message": "AI API key missing. Using default Matrix routine."}

        prompt = f"""
        Act as an elite cyber-fitness AI. The user wants to train: {req.target_muscle}.
        Their current fitness level is: {req.fitness_level}.
        Suggest 4 highly effective exercises. Format strictly as a simple bulleted list with sets and reps.
        Do not add any conversational text.
        """
        
        completion = await client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.1-8b-instant", temperature=0.7, max_tokens=250
        )
        
        return {"status": "success", "ai_routine": completion.choices[0].message.content}
    except Exception as e:
        logger.error(f"AI Workout Error: {e}")
        return {"status": "error", "message": "AI is offline. Please try again later."}


# ==========================================
# 5. RESET TODAY'S WORKOUT
# ==========================================
@router.delete("/reset")
async def reset_daily_workout(req: WorkoutReset):
    """
    Allows the user to completely reset today's workout progress and start over.
    """
    try:
        db = Database.db
        today = datetime.utcnow().strftime("%Y-%m-%d")
        
        result = await db.workout_logs.delete_one({"user_email": req.user_email, "date": today})
        
        if result.deleted_count > 0:
            return {"status": "success", "message": "Matrix workout memory wiped successfully."}
        else:
            return {"status": "error", "message": "No workout found for today to reset."}
            
    except Exception as e:
        logger.error(f"Workout Reset Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to reset workout memory")