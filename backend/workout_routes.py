from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import logging
import os
import json
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
    fitness_goal: Optional[str] = "maintenance"

class WorkoutReset(BaseModel):
    user_email: str

# ==========================================
# GOAL-SPECIFIC DEFAULT ROUTINES
# ==========================================

# Weight Loss — High reps, circuit-style, cardio-heavy
ROUTINE_WEIGHT_LOSS = [
    {"name": "Burpees", "muscle": "Full Body", "sets": 4, "reps": 15},
    {"name": "Jump Squats", "muscle": "Quads & Glutes", "sets": 4, "reps": 15},
    {"name": "Mountain Climbers", "muscle": "Core & Cardio", "sets": 3, "reps": 20},
    {"name": "Kettlebell Swings", "muscle": "Glutes & Hamstrings", "sets": 4, "reps": 15},
    {"name": "Box Step-Ups", "muscle": "Legs & Glutes", "sets": 3, "reps": 12},
    {"name": "Battle Ropes", "muscle": "Arms & Cardio", "sets": 3, "reps": 30},
    {"name": "Plank Hold", "muscle": "Core & Abs", "sets": 3, "reps": 45},
    {"name": "Jumping Lunges", "muscle": "Legs & Glutes", "sets": 3, "reps": 12}
]

# Muscle Gain — Heavy compound lifts, progressive overload
ROUTINE_MUSCLE_GAIN = [
    {"name": "Barbell Bench Press", "muscle": "Chest & Triceps", "sets": 5, "reps": 5},
    {"name": "Barbell Squats", "muscle": "Quads & Glutes", "sets": 5, "reps": 5},
    {"name": "Deadlifts", "muscle": "Back & Hamstrings", "sets": 4, "reps": 5},
    {"name": "Weighted Pull-ups", "muscle": "Back & Biceps", "sets": 4, "reps": 6},
    {"name": "Overhead Press", "muscle": "Shoulders & Triceps", "sets": 4, "reps": 6},
    {"name": "Barbell Rows", "muscle": "Back & Biceps", "sets": 4, "reps": 8},
    {"name": "Incline Dumbbell Press", "muscle": "Upper Chest", "sets": 3, "reps": 8},
    {"name": "Weighted Dips", "muscle": "Chest & Triceps", "sets": 3, "reps": 8}
]

# Maintenance — Balanced mix
ROUTINE_MAINTENANCE = [
    {"name": "Bench Press", "muscle": "Chest & Triceps", "sets": 4, "reps": 10},
    {"name": "Barbell Squats", "muscle": "Quads & Glutes", "sets": 4, "reps": 12},
    {"name": "Deadlifts", "muscle": "Back & Hamstrings", "sets": 3, "reps": 8},
    {"name": "Pull-ups", "muscle": "Back & Biceps", "sets": 3, "reps": 10},
    {"name": "Overhead Press", "muscle": "Shoulders & Triceps", "sets": 3, "reps": 10},
    {"name": "Plank Hold", "muscle": "Core & Abs", "sets": 3, "reps": 45},
    {"name": "Lunges", "muscle": "Legs & Glutes", "sets": 3, "reps": 12},
    {"name": "Bicep Curls", "muscle": "Biceps & Arms", "sets": 3, "reps": 12}
]

GOAL_ROUTINES = {
    "weight_loss": ROUTINE_WEIGHT_LOSS,
    "muscle_gain": ROUTINE_MUSCLE_GAIN,
    "maintenance": ROUTINE_MAINTENANCE
}

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
    Fetches today's workout. If it's a new day, creates a fresh routine
    based on the user's fitness goal (weight_loss, muscle_gain, maintenance).
    """
    try:
        db = Database.db
        today = datetime.utcnow().strftime("%Y-%m-%d")
        
        # Check if today's workout already exists in DB
        workout = await db.workout_logs.find_one({"user_email": user_email, "date": today})
        
        if not workout:
            # Fetch user profile to get their fitness goal
            user = await db.users.find_one({"email": user_email})
            user_goal = user.get("goal", "maintenance") if user else "maintenance"
            
            # Select the appropriate routine based on goal
            selected_routine = GOAL_ROUTINES.get(user_goal, ROUTINE_MAINTENANCE)
            
            # Create a fresh routine with empty progress
            initial_exercises = []
            for ex in selected_routine:
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
                "fitness_goal": user_goal,
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
# 4. AI WORKOUT GENERATOR ROUTE (OVERHAULED)
# ==========================================
@router.post("/generate-ai")
async def generate_ai_routine(req: AIWorkoutRequest):
    """
    Generates a smart AI routine based on user's target muscle group AND fitness goal.
    Returns structured JSON exercises that can be directly loaded into the UI.
    Uses low temperature for consistent results.
    """
    try:
        client = get_groq_client()
        if not client:
            return {"status": "error", "message": "AI API key missing. Using default Matrix routine."}

        # Fetch user's actual goal from DB
        db = Database.db
        user = await db.users.find_one({"email": req.user_email})
        user_goal = req.fitness_goal
        if user:
            user_goal = user.get("goal", req.fitness_goal)

        # Goal-specific instructions for the AI
        goal_instructions = {
            "weight_loss": "Focus on HIGH REPS (15-20), circuit-style exercises, minimal rest, fat-burning compound movements. Include bodyweight and cardio-heavy exercises. Sets should be 3-4.",
            "muscle_gain": "Focus on LOW REPS (5-8), heavy compound lifts for maximum hypertrophy and strength. Include barbell and dumbbell exercises. Sets should be 4-5.",
            "maintenance": "Balance of moderate reps (10-12), mix of compound and isolation exercises. Sets should be 3-4."
        }
        
        goal_instruction = goal_instructions.get(user_goal, goal_instructions["maintenance"])

        prompt = f"""You are a certified fitness trainer AI. Generate exactly 6 exercises for training: {req.target_muscle}.
User's fitness level: {req.fitness_level}.
User's fitness goal: {user_goal}.

GOAL-SPECIFIC INSTRUCTIONS: {goal_instruction}

CRITICAL: You MUST return ONLY a raw JSON array. No markdown, no explanation, no code fences.
Each object must have exactly these keys: "name", "muscle", "sets", "reps"

Example format:
[{{"name":"Barbell Bench Press","muscle":"Chest & Triceps","sets":4,"reps":10}},{{"name":"Incline Dumbbell Press","muscle":"Upper Chest","sets":3,"reps":12}}]

Return ONLY the JSON array, nothing else."""

        completion = await client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            temperature=0.2,
            max_tokens=500
        )
        
        raw_response = completion.choices[0].message.content.strip()
        
        # Clean up response — remove code fences and extra text
        import re
        raw_response = re.sub(r'<think>[\s\S]*?</think>', '', raw_response).strip()
        if "```" in raw_response:
            match = re.search(r'```(?:json)?\s*([\s\S]*?)```', raw_response)
            if match:
                raw_response = match.group(1).strip()
        if not raw_response.startswith("["):
            start = raw_response.find("[")
            end = raw_response.rfind("]") + 1
            if start != -1 and end > start:
                raw_response = raw_response[start:end]
        
        try:
            exercises = json.loads(raw_response)
            
            # Validate and normalize each exercise
            validated_exercises = []
            for ex in exercises:
                validated_ex = {
                    "name": str(ex.get("name", "Unknown Exercise")),
                    "muscle": str(ex.get("muscle", req.target_muscle)),
                    "sets": int(ex.get("sets", 3)),
                    "reps": int(ex.get("reps", 10)),
                    "set_details": []
                }
                # Build set_details array
                for _ in range(validated_ex["sets"]):
                    validated_ex["set_details"].append({
                        "kg": 0.0,
                        "reps": validated_ex["reps"],
                        "completed": False
                    })
                validated_exercises.append(validated_ex)
            
            # Save AI-generated routine to DB for today
            today = datetime.utcnow().strftime("%Y-%m-%d")
            total_volume = 0
            await db.workout_logs.update_one(
                {"user_email": req.user_email, "date": today},
                {"$set": {
                    "exercises": validated_exercises,
                    "total_volume_kg": total_volume,
                    "ai_generated": True,
                    "target_muscle": req.target_muscle,
                    "last_synced": datetime.utcnow().isoformat()
                }},
                upsert=True
            )
            
            return {
                "status": "success",
                "exercises": validated_exercises,
                "goal": user_goal,
                "message": f"AI generated {len(validated_exercises)} exercises for {req.target_muscle} ({user_goal})"
            }
            
        except json.JSONDecodeError:
            logger.warning(f"AI returned non-JSON workout. Raw: {raw_response[:300]}")
            return {
                "status": "error",
                "message": "AI returned an invalid format. Using default routine.",
                "exercises": []
            }
        
    except Exception as e:
        logger.error(f"AI Workout Error: {e}")
        return {"status": "error", "message": "AI is offline. Please try again later.", "exercises": []}


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